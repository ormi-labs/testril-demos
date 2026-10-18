import {
  atoms,
  compareRows,
  decimal,
  normalizeRows,
  paymentNetwork,
  validateRecording,
} from "./model.js";
import { paymentPlan, signPayment } from "./payments.js";

const $ = (selector) => document.querySelector(selector);
let config;
let current;
let wallet;
let payer;
let running = false;
let recordings = [];

async function api(path, body) {
  let response;
  try {
    response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
  } catch {
    throw new Error(
      "The request did not return a response. Reconcile any submitted payment before starting again; download this attempt to preserve its evidence.",
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result;
}

function text(parent, tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function elapsed(ms) {
  return ms === undefined ? "Not measured" : `${(ms / 1000).toFixed(2)} s`;
}

function cost(payments, phase) {
  if (!payments) return "Not measured";
  const selected = payments.filter((p) => p.phase === phase);
  const amount = selected
    .reduce((sum, p) => sum + atoms(p.amount), 0n)
    .toString();
  return `${decimal(amount)} USDC${selected.some((p) => p.confirmation !== "confirmed") ? " authorized · unconfirmed" : " confirmed"}`;
}

function renderProvider(name) {
  const panel = $(`#${name}`);
  const provider = current?.providers[name];
  panel.querySelector(".status").textContent = provider
    ? ({
        done: "Complete",
        error: "Stopped",
        running: "Running",
        payment_required: "Awaiting payment",
        example: "Illustrative example",
      }[provider.status] ?? "Ready")
    : "No run selected";
  panel.querySelector(".read-time").textContent = elapsed(
    provider?.timing?.readMs,
  );
  panel.querySelector(".read-cost").textContent = cost(
    provider?.payments,
    "read",
  );
  panel.querySelector(".prep-time").textContent =
    name === "allium"
      ? "Included in service"
      : elapsed(provider?.timing?.preparationMs);
  panel.querySelector(".prep-cost").textContent =
    name === "allium"
      ? "No separate preparation charge quoted"
      : cost(provider?.payments, "preparation");
  const body = panel.querySelector(".provider-body");
  body.replaceChildren();
  if (!provider) {
    text(
      body,
      "p",
      name === "testril"
        ? "Reusable materialized data, followed by a paid read."
        : "Accountless SQL submission, polling, and result retrieval.",
    );
    return;
  }
  if (provider.error) text(body, "p", provider.error);
  if (provider.rows)
    text(
      body,
      "p",
      `${provider.rows.reduce((sum, row) => sum + atoms(row.swaps), 0n)} swaps · ${provider.rows.length} hours returned`,
    );
  else text(body, "p", `Current step: ${provider.stage ?? "waiting"}`);
  if (provider.timing)
    text(
      body,
      "p",
      `Wallet approval: ${elapsed(provider.timing.walletWaitMs)} · total elapsed: ${elapsed(provider.timing.totalMs)}`,
    );
  if (
    name === "testril" &&
    provider.status === "done" &&
    !provider.payments?.some((p) => p.phase === "preparation")
  )
    text(
      body,
      "p",
      "Coverage reused. Earlier preparation costs and the original payer were not measured in this run.",
    );
  if (provider.payments) {
    const deposit = provider.payments.reduce(
      (sum, p) => sum + atoms(p.depositAmount),
      0n,
    );
    if (deposit)
      text(
        body,
        "p",
        `${decimal(deposit.toString())} USDC authorized for escrow deposits, separate from charges. Unused escrow requires withdrawal.`,
      );
    const details = document.createElement("details");
    text(details, "summary", `Payment evidence (${provider.payments.length})`);
    if (!provider.payments.length)
      text(details, "p", "No payment was submitted during these requests.");
    for (const payment of provider.payments) {
      text(
        details,
        "p",
        `${payment.phase}: ${decimal(payment.amount)} USDC · ${payment.confirmation}`,
      );
      const tx = payment.receipt?.transaction;
      if (/^0x[a-f0-9]{64}$/i.test(tx ?? "")) {
        const link = text(details, "a", `View transaction ${tx.slice(0, 10)}…`);
        link.href = `https://basescan.org/tx/${tx}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    body.append(details);
  }
  if (provider.events?.length) {
    const details = document.createElement("details");
    text(details, "summary", "Execution steps");
    const list = document.createElement("ol");
    provider.events.forEach((event) =>
      text(
        list,
        "li",
        `${event.stage} · ${event.phase} · ${elapsed(event.elapsedMs)}${event.paid ? " · payment submitted" : ""}`,
      ),
    );
    details.append(list);
    body.append(details);
  }
}

function render() {
  if (current)
    $("#window").textContent =
      `${current.spec.fromHour.replace("T", " · ")} → ${current.spec.toHour.slice(11)}:00`;
  for (const name of ["testril", "allium"]) renderProvider(name);
  const rows = $("#rows");
  rows.replaceChildren();
  const available = ["testril", "allium"].filter(
    (name) => current?.providers[name]?.rows,
  );
  if (!available.length) {
    const row = document.createElement("tr");
    text(row, "td", "Choose a recording or run the comparison.").colSpan = 5;
    rows.append(row);
  } else {
    const normalized = Object.fromEntries(
      available.map((name) => [
        name,
        normalizeRows(current.providers[name].rows, current.spec),
      ]),
    );
    for (let i = 0; i < normalized[available[0]].length; i++)
      for (const name of available) {
        const value = normalized[name][i];
        const row = document.createElement("tr");
        [
          value.hour.replace("T", " · ") + ":00",
          name === "testril" ? "Testril" : "Allium",
          value.swaps,
          value.volume0,
          value.volume1,
        ].forEach((v) => text(row, "td", v));
        rows.append(row);
      }
  }
  if (available.length === 2) {
    const comparison = compareRows(
      current.providers.testril.rows,
      current.providers.allium.rows,
      current.spec,
    );
    $("#agreement").textContent =
      current.kind === "example"
        ? "Illustrative values · not a measured comparison"
        : comparison.matches
          ? "All raw values match"
          : `${comparison.differences.length} differences · inspect before comparing performance`;
  } else $("#agreement").textContent = "Waiting for both results";
  $("#download").disabled =
    running || !["attempt", "recorded"].includes(current?.kind);
}

function setMode(mode) {
  if (running) return;
  $("#recorded-controls").hidden = mode !== "recorded";
  $("#wallet-controls").hidden = mode !== "wallet";
  $("#recorded-mode").classList.toggle("selected", mode === "recorded");
  $("#wallet-mode").classList.toggle("selected", mode === "wallet");
}

function example() {
  const rows = Array.from({ length: 3 }, (_, i) => ({
    hour: new Date(Date.parse(`${config.spec.fromHour}:00:00Z`) + i * 3600000)
      .toISOString()
      .slice(0, 13),
    pool: config.spec.pool,
    swaps: String(120 + i * 23),
    volume0: String(903215000000n + BigInt(i) * 103421000000n),
    volume1: String(234987654321098765432n + BigInt(i) * 17000000000000000000n),
  }));
  current = {
    kind: "example",
    spec: config.spec,
    providers: {
      testril: { status: "example", rows },
      allium: { status: "example", rows },
    },
  };
  $("#notice").textContent =
    "Layout example only. These values are invented; no provider was queried and no timing or spending was measured.";
  render();
}

async function connect() {
  wallet = window.ethereum;
  if (!wallet?.request)
    throw new Error(
      "Open this demo in a browser with an Ethereum wallet extension.",
    );
  const accounts = await wallet.request({ method: "eth_requestAccounts" });
  payer = accounts[0];
  if (!/^0x[0-9a-fA-F]{40}$/.test(payer ?? ""))
    throw new Error("The wallet did not provide an account.");
  $("#connect").textContent = `${payer.slice(0, 6)}…${payer.slice(-4)}`;
  $("#run").disabled = !config.liveEnabled;
  $("#notice").textContent =
    "Wallet connected. Connecting does not authorize a payment.";
}

async function approve(name, state) {
  const dialog = $("#payment-dialog");
  $("#payment-title").textContent =
    `Approve ${name === "testril" ? "Testril" : "Allium"} ${state.phase === "preparation" ? "preparation" : "data purchase"}`;
  $("#payment-summary").textContent =
    `Service charge: ${decimal(state.accepted.amount)} real USDC on Base mainnet.`;
  $("#payment-recipient").textContent =
    `Provider receiver: ${state.accepted.payTo}`;
  $("#escrow-note").textContent = atoms(state.depositAmount)
    ? `This also authorizes ${decimal(state.depositAmount)} USDC into Testril escrow. The deposit is not an additional service charge. To recover unused escrow, initiate withdrawal and wait one hour before finalizing. Cancellation does not undo previous purchases.`
    : "No new escrow deposit. Cancellation does not undo previous purchases.";
  dialog.returnValue = "cancel";
  const closed = new Promise((resolve) =>
    dialog.addEventListener("close", resolve, { once: true }),
  );
  dialog.showModal();
  await closed;
  if (dialog.returnValue !== "approve")
    throw new Error(
      "Run canceled. Previously submitted purchases remain in the payment evidence.",
    );
}

async function runProvider(id, name) {
  let state = {
    status: "running",
    stage: name === "testril" ? "bind" : "submit",
    phase: name === "testril" ? "preparation" : "read",
  };
  const timing = { readMs: 0, preparationMs: 0, walletWaitMs: 0, totalMs: 0 };
  const start = performance.now();
  let payment;
  try {
    while (true) {
      // Preserve the authorization intent if the paid response is lost.
      if (payment)
        current.providers[name].payments = [
          ...state.payments,
          {
            phase: state.phase,
            amount: state.accepted.amount,
            depositAmount: state.depositAmount,
            confirmation: "unconfirmed",
            receipt: null,
          },
        ];
      const before = performance.now();
      state = await api(`/api/runs/${id}/step`, {
        provider: name,
        ...(payment ? { payment } : {}),
      });
      const key = state.phase === "preparation" ? "preparationMs" : "readMs";
      timing[key] += performance.now() - before;
      payment = undefined;
      timing.totalMs = performance.now() - start;
      current.providers[name] = { ...state, timing };
      // Payment challenges and channel configs remain transient, outside exported runs.
      delete current.providers[name].challenge;
      delete current.providers[name].accepted;
      delete current.providers[name].channels;
      render();
      if (state.status === "done") return;
      if (state.status === "error") throw new Error(state.error);
      if (state.status === "payment_required") {
        const wait = performance.now();
        try {
          const plan = paymentPlan(state.accepted, state.channels, payer);
          if (plan.depositAmount !== state.depositAmount)
            throw new Error(
              "The escrow deposit estimate changed. Start a new run.",
            );
          await approve(name, state);
          payment = await signPayment(
            wallet,
            payer,
            state.challenge,
            state.accepted,
            plan,
          );
        } finally {
          timing.walletWaitMs += performance.now() - wait;
        }
      } else if (state.waitMs) {
        const wait = performance.now();
        await new Promise((resolve) => setTimeout(resolve, state.waitMs));
        timing[state.stage === "job" ? "preparationMs" : "readMs"] +=
          performance.now() - wait;
      }
    }
  } catch (error) {
    current.providers[name] = {
      ...current.providers[name],
      status: "error",
      error: error.message,
      timing,
    };
    throw error;
  } finally {
    timing.totalMs = performance.now() - start;
    render();
  }
}

async function runComparison() {
  if (running || !payer || !config.liveEnabled) return;
  running = true;
  for (const id of [
    "run",
    "connect",
    "example",
    "recording",
    "recorded-mode",
    "wallet-mode",
  ])
    $(`#${id}`).disabled = true;
  current = {
    schemaVersion: 1,
    kind: "attempt",
    recordedAt: new Date().toISOString(),
    spec: config.spec,
    paymentNetwork,
    providers: {},
  };
  render();
  try {
    const { id } = await api("/api/runs", { wallet: payer });
    $("#notice").textContent =
      "Running Testril, then Allium. Each quote requires approval; wallet waiting time is reported separately.";
    await runProvider(id, "testril");
    await runProvider(id, "allium");
    current.kind = "recorded";
    validateRecording(current);
    $("#notice").textContent =
      "Run complete. Review matching values and payment confirmations before drawing conclusions. Download the run to preserve its evidence.";
  } catch (error) {
    $("#notice").textContent = error.message;
  } finally {
    running = false;
    for (const id of [
      "connect",
      "example",
      "recording",
      "recorded-mode",
      "wallet-mode",
    ])
      $(`#${id}`).disabled = false;
    $("#run").disabled = !config.liveEnabled;
    render();
  }
}

function download() {
  if (current.kind === "recorded") validateRecording(current);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(current, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "pool-volume-run.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function initialize() {
  [config, recordings] = await Promise.all([
    api("/api/config"),
    api("/api/recordings"),
  ]);
  $("#window").textContent =
    `${config.spec.fromHour.replace("T", " · ")} → ${config.spec.toHour.slice(11)}:00`;
  $("#sql").textContent = config.sql;
  $("#live-reason").textContent =
    config.liveReason ??
    "Fresh runs use your wallet. No server wallet subsidizes purchases.";
  const select = $("#recording");
  select.replaceChildren();
  if (!recordings.length) {
    text(select, "option", "No recorded runs yet").value = "";
    $("#notice").textContent =
      "No measured recording has been published yet. Explore the labelled layout example, or connect your wallet when fresh runs are enabled.";
  } else {
    for (const entry of recordings) {
      validateRecording(entry.run);
      text(
        select,
        "option",
        `${entry.run.recordedAt.slice(0, 10)} · ${entry.id}`,
      ).value = entry.id;
    }
    showRecording(recordings[0].id);
  }
  render();
}

function showRecording(id) {
  current = structuredClone(recordings.find((entry) => entry.id === id).run);
  $("#notice").textContent =
    `Recorded ${current.recordedAt}. Playback makes no paid requests. Measurements and payment evidence were supplied by the recording's operator.`;
  render();
}

$("#recorded-mode").addEventListener("click", () => setMode("recorded"));
$("#wallet-mode").addEventListener("click", () => setMode("wallet"));
$("#example").addEventListener("click", example);
$("#recording").addEventListener("change", (event) => {
  if (event.target.value) showRecording(event.target.value);
});
$("#connect").addEventListener("click", () =>
  connect().catch((error) => {
    $("#notice").textContent = error.message;
  }),
);
$("#run").addEventListener("click", runComparison);
$("#download").addEventListener("click", () => {
  try {
    download();
  } catch (error) {
    $("#notice").textContent = error.message;
  }
});
initialize().catch((error) => {
  $("#notice").textContent = `Cannot load the demo: ${error.message}`;
});
