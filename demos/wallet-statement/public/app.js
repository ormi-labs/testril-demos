import { scope, dayScope, compare, decimal, evidenceCosts } from "./model.js";
import { signPayment } from "./payments.js";
import { runComparison } from "./runner.js";

const $ = (selector) => document.querySelector(selector);
const journalKey = "testril-wallet-statement:last-run";
const stageText = {
  bind: "Connecting",
  coverage: "Checking data",
  read: "Reading transfers",
  materialize: "Preparing data",
  job: "Waiting for preparation",
  provenance: "Retrieving provenance",
  transactions: "Reading pages",
};
let current, baseline, payer, wallet, savedLive;
let busy = false,
  storageBlocked = false,
  mode = "recorded";
let ledgerRows, ledgerLength;
const short = (v) => `${v.slice(0, 8)}…${v.slice(-5)}`;
const ratio = (a, b) => {
  const value = Number(a) / Number(b);
  return value >= 0.1 ? value.toFixed(1) : value.toPrecision(2);
};
const elapsed = (v) =>
  Number.isFinite(v) ? `${(v / 1000).toFixed(2)} s` : "Unknown";
const yesterday = new Date(
  Date.parse(new Date().toISOString().slice(0, 10)) - 86400000,
)
  .toISOString()
  .slice(0, 10);
$("#report-date").max = yesterday;
$("#report-date").value = yesterday;
function text(parent, tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}
function validDate() {
  try {
    dayScope($("#report-date").value);
    return true;
  } catch {
    return false;
  }
}
function phaseCost(p, phase) {
  if (!p) return "—";
  const payments = p.payments.filter((v) => v.phase === phase);
  if (!payments.length && p.status !== "done") return "—";
  const c = evidenceCosts(payments, phase);
  return decimal(c.amount) + (c.confirmed ? "" : " (unconfirmed)");
}
function phaseTime(p, phase) {
  return p && (p.status === "done" || p.events.some((v) => v.phase === phase))
    ? elapsed(p.timing[phase])
    : "—";
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
  if (!response.ok) {
    const error = new Error(value.error ?? "The request could not finish.");
    if (typeof value.ref === "string" && /^[a-f0-9-]{36}$/.test(value.ref))
      error.ref = value.ref;
    throw error;
  }
  return value;
}
function persist(run) {
  localStorage.setItem(journalKey, JSON.stringify(run));
  savedLive = run;
}
function renderLedger() {
  const name = $("#ledger-provider").value;
  const p = current?.providers[name];
  const rows = p?.rows ?? [];
  if (
    !$("#ledger").open ||
    (ledgerRows === rows && ledgerLength === rows.length)
  )
    return;
  ledgerRows = rows;
  ledgerLength = rows.length;
  $("#ledger-caption").textContent =
    `${name === "testril" ? "Testril" : "Nansen"}: ${rows.length} transfers${p?.status === "done" ? " · complete ledger" : " received so far"}. Repeated transfers are preserved.`;
  const fragment = document.createDocumentFragment();
  for (const r of rows) {
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
    const [whole, fraction] = decimal(r.value).split(".");
    text(
      tr,
      "td",
      `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`,
    );
    fragment.append(tr);
  }
  $("#transfers").replaceChildren(fragment);
}
function render() {
  for (const name of ["testril", "nansen"]) {
    const p = current?.providers[name],
      panel = $(`#${name}`);
    panel.querySelector(".status").textContent = !p
      ? "Ready"
      : ({
          done: "Complete",
          waiting: "Waiting",
          approval: "Awaiting approval",
          stopped: "Stopped",
          running: stageText[p.stage] ?? "Running",
        }[p.status] ?? p.status);
    panel.querySelector(".query-cost").textContent = phaseCost(p, "query");
    panel.querySelector(".query-time").textContent = phaseTime(p, "query");
    panel.querySelector(".provider-notes").textContent = !p
      ? ""
      : p.status === "done"
        ? name === "nansen"
          ? `${p.pages} complete pages`
          : "Complete transfer history"
        : "Run incomplete · figures shown so far";
    $(`#${name}-count`).textContent =
      p && (p.rows.length || p.status === "done") ? String(p.rows.length) : "—";
    for (const phase of name === "testril"
      ? ["preparation", "query", "provenance"]
      : ["query"]) {
      $(`#${name}-${phase}-cost`).textContent = phaseCost(p, phase);
      $(`#${name}-${phase}-time`).textContent = phaseTime(p, phase);
    }
  }
  const t = current?.providers.testril,
    n = current?.providers.nansen;
  const complete = t?.status === "done" && n?.status === "done";
  const matches = complete && compare(t.rows, n.rows).matches;
  $("#agreement").textContent = complete
    ? matches
      ? "Every transfer and amount matches"
      : "The returned transfers differ"
    : "Waiting for both complete answers";
  const tc = evidenceCosts(t?.payments ?? [], "query"),
    nc = evidenceCosts(n?.payments ?? [], "query");
  $("#price-comparison").textContent =
    matches &&
    tc.confirmed &&
    nc.confirmed &&
    BigInt(tc.amount) > 0n &&
    BigInt(nc.amount) > 0n
      ? `Nansen’s read cost was ${ratio(nc.amount, tc.amount)}× Testril’s.`
      : "";
  $("#time-comparison").textContent =
    matches && t.timing.query > 0 && n.timing.query > 0
      ? `Nansen took ${ratio(n.timing.query, t.timing.query)}× as long as Testril.`
      : "";
  const prep = t?.payments.some((p) => p.phase === "preparation");
  if (t && !prep) {
    $("#testril-preparation-cost").textContent =
      t.status !== "done"
        ? "—"
        : mode === "recorded" && baseline?.priorPreparation?.amount
          ? decimal(baseline.priorPreparation.amount)
          : "Unknown";
    $("#testril-preparation-time").textContent =
      t.status === "done" ? "Unknown" : "—";
  }
  $("#preparation-note").textContent =
    !t || t.status !== "done"
      ? ""
      : prep
        ? "Preparation was purchased during this run; its time includes setup and coverage checks."
        : `Prepared data was reused, with no new preparation charge. Setup and coverage checks took ${elapsed(t.timing.preparation)}. ${mode === "recorded" && baseline?.priorPreparation?.amount ? "The preparation cost shown was paid earlier; that job’s time was not recorded." : "Earlier preparation costs and time are unknown."}`;
  const evidence = $("#payment-evidence");
  evidence.replaceChildren();
  if (Number.isFinite(current?.scopeResolutionMs))
    text(
      evidence,
      "p",
      `Shared day lookup: ${elapsed(current.scopeResolutionMs)}, no payment requested. Excluded from provider read times.`,
    );
  for (const name of ["testril", "nansen"]) {
    const p = current?.providers[name];
    if (!p) continue;
    text(
      evidence,
      "p",
      `${name === "testril" ? "Testril" : "Nansen"}: ${elapsed(p.timing.total)} total elapsed, including ${elapsed(p.timing.wallet)} wallet approval and signing.`,
    );
    for (const payment of p.payments) {
      text(
        evidence,
        "p",
        `${payment.action}: ${decimal(payment.amount)} USDC · ${payment.confirmed ? "provider-confirmed" : "unconfirmed"}`,
      );
      if (BigInt(payment.depositAmount))
        text(
          evidence,
          "p",
          `Escrow deposit: ${decimal(payment.depositAmount)} USDC, separate from fees.`,
        );
      if (payment.receipt?.transaction) {
        const a = text(
          evidence,
          "a",
          `Base transaction ${short(payment.receipt.transaction)} ↗`,
        );
        a.href = `https://basescan.org/tx/${payment.receipt.transaction}`;
        a.target = "_blank";
        a.rel = "noreferrer";
      }
    }
  }
  const report = current?.scope;
  $("#report-window").textContent = report
    ? `${report.from_time.slice(0, 10)} · ${report.from_time.slice(0, 10) === report.to_time.slice(0, 10) ? `${report.from_time.slice(11, 16)}–${report.to_time.slice(11, 16)} UTC` : "full UTC day"}`
    : mode === "live"
      ? `${$("#report-date").value || "Choose a day"} · full UTC day`
      : "";
  $("#download").disabled = !current;
  $("#run").disabled =
    busy ||
    storageBlocked ||
    !payer ||
    !validDate() ||
    Boolean(savedLive?.pending);
  $("#connect").disabled = busy;
  $("#report-date").disabled = busy || Boolean(savedLive?.pending);
  $("#recorded-controls").hidden = mode !== "recorded";
  $("#live-controls").hidden = mode !== "live";
  $("#recovery").hidden = !savedLive?.pending;
  $("#run-panel").setAttribute(
    "aria-labelledby",
    mode === "recorded" ? "recorded" : "live",
  );
  for (const name of ["recorded", "live"]) {
    const tab = $(`#${name}`);
    const selected = mode === name;
    tab.disabled = busy;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  renderLedger();
}
function clearLedger() {
  $("#ledger").open = false;
  ledgerRows = undefined;
  $("#transfers").replaceChildren();
}
async function loadRecording() {
  baseline = await api("recordings/hour-12.json");
  if (mode === "recorded") current = structuredClone(baseline);
  render();
}
function selectMode(next) {
  mode = next;
  current =
    next === "recorded"
      ? baseline
        ? structuredClone(baseline)
        : null
      : (savedLive ?? null);
  if (next === "live" && savedLive?.scope.from_time)
    $("#report-date").value = savedLive.scope.from_time.slice(0, 10);
  clearLedger();
  $("#notice").textContent = storageBlocked
    ? "Saved browser state could not be read. Live purchases are blocked until the previous state has been reviewed."
    : next === "live"
      ? (savedLive?.error ?? "Choose a day and connect your wallet.")
      : "";
  render();
}
function approve(quote) {
  const dialog = $("#payment-dialog");
  $("#payment-summary").textContent =
    `${quote.provider === "testril" ? "Testril" : "Nansen"}: ${{ read: "retrieve transfers", materialize: "prepare this day", provenance: "retrieve source evidence", transactions: "retrieve one transaction page" }[quote.action]} · ${decimal(quote.amount)} USDC service charge.`;
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
  if (busy || storageBlocked || !payer || !validDate() || savedLive?.pending)
    return;
  busy = true;
  clearLedger();
  render();
  try {
    current = await runComparison({
      window: $("#report-date").value,
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
            ? "Run complete."
            : "Running your selected day. Each purchase requires approval.");
        render();
      },
    });
  } finally {
    busy = false;
    render();
  }
});
$("#recorded").addEventListener("click", () => selectMode("recorded"));
$("#live").addEventListener("click", () => selectMode("live"));
$(".tabs").addEventListener("keydown", (event) => {
  if (!busy && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "recorded"
        : event.key === "End"
          ? "live"
          : mode === "recorded"
            ? "live"
            : "recorded";
    selectMode(next);
    $(`#${next}`).focus();
  }
});
$("#report-date").addEventListener("change", () => {
  current = null;
  clearLedger();
  $("#notice").textContent = validDate()
    ? "Ready to retrieve your selected day."
    : "Choose a completed UTC day.";
  render();
});
$("#ledger").addEventListener("toggle", renderLedger);
$("#ledger-provider").addEventListener("change", renderLedger);
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
  a.download = `wallet-statement-${value.scope.window ?? value.scope.hour}-${value.status === "done" ? "run" : "attempt"}.json`;
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
      !["testril", "nansen"].every(
        (name) =>
          Array.isArray(savedLive.providers?.[name]?.rows) &&
          Array.isArray(savedLive.providers[name].payments) &&
          savedLive.providers[name].timing,
      )
    )
      throw new Error("Invalid saved run");
    scope(savedLive.scope.window ?? savedLive.scope.hour);
    if (savedLive.status === "running") {
      savedLive.status = "stopped";
      savedLive.error =
        "This run was interrupted. Check any pending purchase before another run.";
    }
    if (savedLive.pending) {
      mode = "live";
    }
  }
} catch {
  storageBlocked = true;
  savedLive = undefined;
  $("#notice").textContent =
    "Saved browser state could not be read. Live runs require working browser storage.";
}
selectMode(mode);
loadRecording().catch(() => {
  $("#notice").textContent =
    "The recorded report could not be loaded. No paid requests were made.";
});
