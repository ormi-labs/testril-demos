import { summary, compare, decimal, evidenceCosts } from "./model.js";
import { signPayment } from "./payments.js";
import { runComparison } from "./runner.js";
import {
  verifyWindow,
  rpcClient,
  replay,
  VerificationError,
} from "./verification.js";

const $ = (selector) => document.querySelector(selector);
const journalKey = "testril-wallet-statement:last-run";
const stageText = {
  bind: "Connecting scope",
  coverage: "Checking existing data",
  read: "Reading transfers",
  materialize: "Preparing data",
  job: "Waiting for preparation",
  provenance: "Reading source evidence",
  transactions: "Reading transaction pages",
};
let current,
  baseline,
  payer,
  wallet,
  busy = false,
  proofBusy = false,
  proofPassed = false,
  storageBlocked = false,
  savedLive;
let mode = "recorded",
  archivePromise;
const short = (value) => `${value.slice(0, 8)}…${value.slice(-5)}`;
const amountText = (value) => {
  const [whole, fraction] = decimal(value).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};
const elapsed = (value) =>
  Number.isFinite(value) ? `${(value / 1000).toFixed(2)} s` : "Not measured";
function text(parent, tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}
async function api(path, body) {
  let response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new Error("The request did not return a response.");
  }
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? "The request could not finish.");
  return value;
}
function persist(run) {
  localStorage.setItem(journalKey, JSON.stringify(run));
  savedLive = run;
}
function cost(payments, phase) {
  const selected = payments.filter((p) => p.phase === phase);
  if (!selected.length) return "No payment requested";
  const c = evidenceCosts(payments, phase);
  return `${decimal(c.amount)} USDC${c.confirmed ? " · provider-confirmed" : " · unconfirmed authorization"}`;
}
function renderProvider(name) {
  const panel = $(`#${name}`),
    p = current?.providers[name];
  panel.querySelector(".status").textContent = p
    ? ({
        done: "Complete",
        running: stageText[p.stage] ?? "Running",
        approval: "Awaiting approval",
        stopped: "Stopped",
        waiting: "Waiting",
      }[p.status] ?? p.status)
    : "Ready";
  const totals = p?.rows.length ? summary(p.rows) : null;
  panel.querySelector(".count").textContent =
    p?.status === "done" || totals ? String(p.rows.length) : "—";
  panel.querySelector(".incoming").textContent = totals
    ? amountText(totals.incoming)
    : "—";
  panel.querySelector(".outgoing").textContent = totals
    ? amountText(totals.outgoing)
    : "—";
  panel.querySelector(".query-time").textContent = elapsed(p?.timing.query);
  panel.querySelector(".query-cost").textContent = p
    ? cost(p.payments, "query")
    : "—";
  const notes = panel.querySelector(".provider-notes");
  notes.replaceChildren();
  if (p)
    text(
      notes,
      "p",
      name === "nansen"
        ? `${p.pages ?? 0} complete transaction pages · ${totals?.counterparties.length ?? 0} other addresses`
        : `${totals?.counterparties.length ?? 0} other addresses · exact raw transfer amounts`,
    );
  if (p) {
    text(
      notes,
      "p",
      `Complete elapsed: ${elapsed(p.timing.total)} · wallet approval/signing: ${elapsed(p.timing.wallet)}.`,
    );
    if (name === "testril") {
      const prepared = p.payments.some((v) => v.phase === "preparation");
      text(
        notes,
        "p",
        prepared
          ? `Preparation: ${cost(p.payments, "preparation")} · ${elapsed(p.timing.preparation)}.`
          : `Coverage reused. Known initial preparation: ${decimal(baseline?.priorPreparation.amount ?? "35880")} USDC, separate from this run. Setup: ${elapsed(p.timing.preparation)}.`,
      );
    }
  }
  const details = panel.querySelector(".details-body");
  details.replaceChildren();
  if (!p) return;
  text(
    details,
    "p",
    `Complete elapsed: ${elapsed(p.timing.total)}. Wallet approval and signing: ${elapsed(p.timing.wallet)}.`,
  );
  if (name === "testril") {
    text(
      details,
      "p",
      `Preparation this run: ${cost(p.payments, "preparation")} · ${elapsed(p.timing.preparation)}.`,
    );
    if (!p.payments.some((v) => v.phase === "preparation"))
      text(
        details,
        "p",
        `Coverage reused. The known initial preparation for this recorded hour was ${decimal(baseline?.priorPreparation.amount ?? "35880")} USDC, separate from this run’s reads.`,
      );
    text(
      details,
      "p",
      `Provenance: ${cost(p.payments, "provenance")} · ${elapsed(p.timing.provenance)}.`,
    );
  }
  const deposit = p.payments.reduce((n, v) => n + BigInt(v.depositAmount), 0n);
  if (deposit)
    text(
      details,
      "p",
      `${decimal(deposit.toString())} USDC in escrow deposits, separate from service charges. Unspent funds remain in the channel until withdrawn.`,
    );
  for (const payment of p.payments) {
    text(
      details,
      "p",
      `${payment.action}: ${decimal(payment.amount)} USDC · ${payment.confirmed ? "provider-confirmed" : "unconfirmed"}`,
    );
    if (payment.receipt?.transaction) {
      const a = text(
        details,
        "a",
        `Base transaction ${short(payment.receipt.transaction)} ↗`,
      );
      a.href = `https://basescan.org/tx/${payment.receipt.transaction}`;
      a.target = "_blank";
      a.rel = "noreferrer";
    }
  }
  if (p.events.length) {
    const list = document.createElement("ol");
    p.events.forEach((event) =>
      text(list, "li", `${event.action} · ${elapsed(event.elapsedMs)}`),
    );
    details.append(list);
  }
}
function render() {
  for (const name of ["testril", "nansen"]) renderProvider(name);
  const t = current?.providers.testril,
    n = current?.providers.nansen;
  $("#agreement").textContent =
    t?.status === "done" && n?.status === "done"
      ? compare(t.rows, n.rows).matches
        ? "Every transfer and amount matches"
        : "The returned transfers differ"
      : "Waiting for both complete answers";
  const rows = $("#transfers");
  rows.replaceChildren();
  for (const r of t?.rows.slice(0, 12) ?? []) {
    const tr = document.createElement("tr");
    const a = text(text(tr, "td", ""), "a", short(r.tx));
    a.href = `https://etherscan.io/tx/${r.tx}#eventlog`;
    a.target = "_blank";
    a.rel = "noreferrer";
    const incoming = r.to === current.scope.wallet;
    text(
      tr,
      "td",
      r.from === r.to ? "Self-transfer" : incoming ? "Incoming" : "Outgoing",
    );
    text(tr, "td", short(incoming ? r.from : r.to), "address");
    text(tr, "td", amountText(r.value));
    rows.append(tr);
  }
  const p = t?.provenance;
  $("#proof-blocks").textContent = p?.block_count ?? "—";
  $("#proof-window").textContent = p ? String(p.to_block - p.from_block) : "—";
  $("#proof-transfers").textContent = t?.rows.length ?? "—";
  const trail = $("#source-trail");
  trail.replaceChildren();
  if (p) {
    text(
      trail,
      "p",
      `Computation: ${p.computation.id}, version ${p.computation.version}. Ethereum blocks ${p.from_block} to ${p.to_block - 1}.`,
    );
    text(trail, "p", `Source fingerprint: ${p.digest}`, "address");
    const list = document.createElement("ul");
    for (const b of p.blocks) {
      const a = text(
        text(list, "li", ""),
        "a",
        `Block ${b.number} · ${short(b.block_hash)} ↗`,
      );
      a.href = `https://etherscan.io/block/${b.number}`;
      a.target = "_blank";
      a.rel = "noreferrer";
    }
    trail.append(list);
  }
  $("#replay-proof").disabled = $("#fresh-proof").disabled =
    busy || proofBusy || !p;
  $("#tamper").disabled = busy || proofBusy || !proofPassed;
  $("#download").disabled = !current;
  $("#run").disabled =
    busy ||
    proofBusy ||
    storageBlocked ||
    !payer ||
    Boolean(savedLive?.pending);
  $("#connect").disabled = busy || proofBusy;
  for (const id of ["#hour", "#recorded", "#live"])
    $(id).disabled = busy || proofBusy;
  if (mode === "live" && savedLive?.pending) $("#hour").disabled = true;
  $("#recorded-controls").hidden = mode !== "recorded";
  $("#live-controls").hidden = mode !== "live";
  $("#recovery").hidden = !savedLive?.pending;
  $("#recorded").classList.toggle("selected", mode === "recorded");
  $("#live").classList.toggle("selected", mode === "live");
}
async function loadRecording() {
  baseline = await api(`recordings/hour-${$("#hour").value}.json`);
  if (mode === "recorded") current = structuredClone(baseline);
  else
    current =
      savedLive?.scope.hour === Number($("#hour").value) ? savedLive : null;
  proofPassed = false;
  $("#proof-status").textContent = "Saved evidence available";
  $("#proof-result").replaceChildren();
  $("#recording-note").textContent = baseline.recordingNote;
  $("#notice").textContent =
    mode === "recorded"
      ? Number.isFinite(baseline.providers.testril.timing.query)
        ? "Recorded production run · automated approval and signing time is shown separately."
        : "Verified case study · no complete browser timings were recorded for this run."
      : "Connect a Base USDC wallet to request the fixed report.";
  render();
}
async function verify(mode) {
  const selected = current;
  const data = {
    scope: selected.scope,
    provenance: selected.providers.testril.provenance,
    rows: structuredClone(selected.providers.testril.rows),
  };
  const edited = mode === "edited";
  if (edited) data.rows[0].value = (BigInt(data.rows[0].value) + 1n).toString();
  proofBusy = true;
  render();
  $("#proof-status").textContent = "Checking…";
  $("#proof-result").textContent =
    mode === "live"
      ? "Reading Ethereum records directly from rpc.mevblocker.io…"
      : "Reconstructing the answer from the saved Ethereum evidence…";
  const started = performance.now();
  try {
    let rpc;
    if (mode === "live") rpc = rpcClient("https://rpc.mevblocker.io", []);
    else {
      archivePromise ??= api("verification/evidence.json");
      rpc = replay(await archivePromise);
    }
    const result = await verifyWindow(data, rpc);
    if (edited) throw new Error("The edited amount was unexpectedly accepted.");
    const shown = summary(selected.providers.testril.rows);
    const partnerKey = (r) =>
      [
        r.address,
        r.transfers,
        r.incoming_atoms ?? r.incoming,
        r.outgoing_atoms ?? r.outgoing,
      ].join(":");
    if (
      shown.incoming !== result.incoming_atoms ||
      shown.outgoing !== result.outgoing_atoms ||
      JSON.stringify(shown.counterparties.map(partnerKey).sort()) !==
        JSON.stringify(result.counterparties.map(partnerKey).sort())
    )
      throw new VerificationError(
        "The displayed totals differ from the independent reconstruction.",
      );
    proofPassed = true;
    selected.verification = {
      mode,
      at: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - started),
      result,
    };
    $("#proof-status").textContent =
      mode === "live"
        ? "Live Ethereum check passed"
        : "Saved evidence replay passed";
    $("#proof-result").textContent =
      `${result.transfers} transfers rebuilt exactly, across ${result.contributing_blocks} contributing blocks. Source fingerprint and every hourly counterparty total reconstructed. ${mode === "live" ? "The source records came directly from the external Ethereum service." : "This checks the archived source responses; it is not a fresh network check."}`;
    $("#proof-result").className = "proof-ok";
    if (selected.kind === "live") persist(selected);
  } catch (error) {
    if (edited && error instanceof VerificationError) {
      $("#proof-status").textContent = "Edited copy rejected";
      $("#proof-result").textContent =
        "The 0.000001 USDC edit was detected. A copy of one transfer was changed; the original run and its amounts are unchanged.";
      $("#proof-result").className = "proof-edited";
    } else {
      $("#proof-status").textContent = "Check did not complete";
      $("#proof-result").textContent =
        "Verification did not pass. The source service may be unavailable or the evidence may differ. No conclusion was substituted for a failed check. Download the verifier to inspect the details with your own node.";
      $("#proof-result").className = "proof-edited";
    }
  } finally {
    proofBusy = false;
    render();
  }
}
function approve(quote) {
  const dialog = $("#payment-dialog");
  $("#payment-summary").textContent =
    `${quote.provider === "testril" ? "Testril" : "Nansen"}: ${{ read: "retrieve transfers", materialize: "prepare this hour", provenance: "retrieve source evidence", transactions: "retrieve one transaction page" }[quote.action]} · ${decimal(quote.amount)} USDC service charge.`;
  $("#payment-recipient").textContent = `Recipient: ${quote.payTo}`;
  $("#deposit-note").textContent = BigInt(quote.deposit)
    ? `A separate ${decimal(quote.deposit)} USDC escrow deposit is needed. The service charge is deducted from the channel; the deposit is not a second fee.`
    : "No new escrow deposit is requested for this purchase.";
  dialog.returnValue = "cancel";
  return new Promise((done) => {
    dialog.addEventListener(
      "close",
      () => done(dialog.returnValue === "approve"),
      { once: true },
    );
    dialog.showModal();
  });
}
$("#connect").addEventListener("click", async () => {
  try {
    wallet = window.ethereum;
    if (!wallet)
      throw new Error(
        "Install an Ethereum wallet extension to run this comparison.",
      );
    [payer] = await wallet.request({ method: "eth_requestAccounts" });
    if (!/^0x[0-9a-f]{40}$/i.test(payer))
      throw new Error("The wallet did not supply an address.");
    $("#notice").textContent =
      `Connected ${short(payer)}. This wallet pays; the report address remains fixed.`;
  } catch {
    payer = null;
    $("#notice").textContent = wallet
      ? "Wallet connection was declined or unavailable."
      : "Install an Ethereum wallet extension to run this comparison.";
  }
  render();
});
$("#run").addEventListener("click", async () => {
  if (busy || storageBlocked || !payer || savedLive?.pending) return;
  busy = true;
  proofPassed = false;
  $("#proof-result").replaceChildren();
  render();
  try {
    current = await runComparison({
      hour: Number($("#hour").value),
      payer,
      request: api,
      approve,
      sign: (q) => signPayment(wallet, payer, q.challenge, q.accepted, q.plan),
      persist,
      onChange: (run) => {
        current = run;
        $("#notice").textContent =
          run.error ??
          (run.status === "done"
            ? "Run complete. Download the results and follow the source evidence below."
            : "Running the fixed comparison. Each purchase requires your approval.");
        render();
      },
    });
  } finally {
    busy = false;
    render();
  }
});
$("#recorded").addEventListener("click", async () => {
  mode = "recorded";
  await loadRecording();
});
$("#live").addEventListener("click", () => {
  mode = "live";
  current = savedLive ?? null;
  if (savedLive) $("#hour").value = String(savedLive.scope.hour);
  $("#notice").textContent = storageBlocked
    ? "Saved browser state could not be read. Live purchases are blocked until browser storage is available and the previous state has been reviewed."
    : (savedLive?.error ??
      "Connect a Base USDC wallet to buy the same fixed report.");
  render();
});
$("#hour").addEventListener("change", () =>
  loadRecording().catch(() => {
    $("#notice").textContent = "The recorded report could not be loaded.";
  }),
);
$("#replay-proof").addEventListener("click", () => verify("saved"));
$("#fresh-proof").addEventListener("click", () => verify("live"));
$("#tamper").addEventListener("click", () => verify("edited"));
$("#check-status").addEventListener("click", async () => {
  try {
    const state = await api(`api/runs/${savedLive.id}`);
    if (!state.pending) {
      for (const p of Object.values(savedLive.providers).flatMap(
        (p) => p.payments,
      )) {
        const op = state.operations.find((o) => o.id === p.id);
        if (op) {
          p.confirmed = op.confirmed;
          p.receipt = op.receipt;
        }
      }
      savedLive.pending = null;
      savedLive.status = "stopped";
      persist(savedLive);
      $("#notice").textContent =
        "The server has a completed payment record. The interrupted data request was not repeated. Download the attempt before explicitly starting another comparison.";
    } else
      $("#notice").textContent =
        "The outcome remains uncertain. No payment will be repeated automatically; retain the attempt and inspect the wallet/provider evidence.";
  } catch {
    $("#notice").textContent =
      "The saved payment status could not be checked. The pending purchase remains protected.";
  }
  render();
});
function downloadRun(value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `wallet-statement-${value.scope.hour}-${value.status === "done" ? "run" : "attempt"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#download").addEventListener("click", () => downloadRun(current));
$("#download-pending").addEventListener("click", () => downloadRun(savedLive));
try {
  const saved = localStorage.getItem(journalKey);
  if (saved) {
    savedLive = JSON.parse(saved);
    if (
      savedLive?.schemaVersion !== 1 ||
      savedLive.kind !== "live" ||
      ![12, 13].includes(savedLive.scope?.hour) ||
      !["testril", "nansen"].every(
        (name) =>
          Array.isArray(savedLive.providers?.[name]?.rows) &&
          Array.isArray(savedLive.providers[name].payments) &&
          savedLive.providers[name].timing,
      )
    )
      throw new Error("Invalid saved run");
    if (savedLive.status === "running") {
      savedLive.status = "stopped";
      savedLive.error =
        "This run was interrupted. Check any pending purchase before another run.";
    }
    if (savedLive.pending) {
      mode = "live";
      $("#hour").value = String(savedLive.scope.hour);
    }
  }
} catch {
  storageBlocked = true;
  savedLive = undefined;
  $("#notice").textContent =
    "Saved browser state could not be read. Live runs require working browser storage.";
}
loadRecording().catch(() => {
  $("#notice").textContent =
    "The recorded report could not be loaded. No paid requests were made.";
});
