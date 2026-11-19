import {
  scope,
  dayScope,
  compare,
  compareCounterparties,
  transferCount,
  decimal,
  evidenceCosts,
} from "./model.js";
import { signPayment } from "./payments.js";
import { runComparison } from "./runner.js";
import { openRunJournal } from "./run-journal.js";

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
  counterparties: "Reading daily totals",
  "source-provenance": "Retrieving source provenance",
};
let current, baseline, payer, wallet, journal;
const liveRuns = {};
const pendingRun = () => Object.values(liveRuns).find((run) => run.pending);
function reportFor(which) {
  const run = mode === "recorded" ? recordings[which] : liveRuns[which];
  return mode === "recorded" ||
    run?.scope.from_time.slice(0, 10) === $("#report-date").value
    ? run
    : null;
}
const recordings = {};
let method = "transactions";
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
async function persist(run) {
  await journal.save(run);
  liveRuns[run.method] = run;
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
  const totals = method === "totals";
  $("#ledger-caption").textContent = totals
    ? `${name === "testril" ? "Testril" : "Nansen"}: ${rows.length} counterparties. Counts cover USDC only; missing token amounts are shown as unavailable.`
    : `${name === "testril" ? "Testril" : "Nansen"}: ${rows.length} transfers${p?.status === "done" ? " · complete ledger" : " received so far"}. Repeated transfers are preserved.`;
  const head = document.createElement("tr");
  for (const label of totals
    ? ["Other address", "Transfers", "USDC received", "USDC sent"]
    : ["Transaction", "Direction", "Other address", "USDC"])
    text(head, "th", label);
  $("#ledger-head").replaceChildren(head);
  const fragment = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (totals) {
      const a = text(text(tr, "td", ""), "a", short(r.address));
      a.href = `https://etherscan.io/address/${r.address}`;
      a.target = "_blank";
      a.rel = "noreferrer";
      text(tr, "td", r.transfers);
      text(tr, "td", r.incoming === null ? "Unavailable" : decimal(r.incoming));
      text(tr, "td", r.outgoing === null ? "Unavailable" : decimal(r.outgoing));
      fragment.append(tr);
      continue;
    }
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
function renderSummary(which) {
  const run = reportFor(which);
  const prefix = which === "totals" ? "totals-" : "";
  for (const name of ["testril", "nansen"]) {
    const p = run?.providers[name],
      panel = $(`#${prefix}${name}`);
    panel.classList.toggle("unmeasured", !p);
    panel.querySelector(".status").textContent = !p
      ? mode === "recorded"
        ? "Not recorded"
        : "Ready"
      : ({
          done: "Complete",
          waiting: "Waiting",
          approval: "Awaiting approval",
          stopped: "Stopped",
          running: stageText[p.stage] ?? "Running",
        }[p.status] ?? p.status);
    panel.querySelector(".query-cost").textContent = p
      ? phaseCost(p, "query")
      : "Not measured";
    panel.querySelector(".query-time").textContent = p
      ? phaseTime(p, "query")
      : "Not measured";
    panel.querySelector(".provider-notes").textContent = !p
      ? mode === "recorded"
        ? "No saved measurement for this method yet."
        : "Choose a day and run this method."
      : p.status === "done"
        ? name === "nansen"
          ? `${transferCount(p.rows, which)} transfers · ${p.pages} complete ${which === "totals" ? "summary " : ""}page${p.pages === 1 ? "" : "s"}`
          : which === "totals"
            ? `${transferCount(p.rows, which)} transfers · daily counterparty totals`
            : `${p.rows.length} transfers · complete ledger`
        : "Run incomplete · figures shown so far";
  }
  const t = run?.providers.testril,
    n = run?.providers.nansen;
  const complete = t?.status === "done" && n?.status === "done";
  const matches =
    complete &&
    (which === "totals"
      ? compareCounterparties(t.rows, n.rows)
      : compare(t.rows, n.rows)
    ).matches;
  $(`#${prefix}summary-agreement`).textContent = complete
    ? matches
      ? "Answers match"
      : "The returned answers differ"
    : "";
  const tc = evidenceCosts(t?.payments ?? [], "query"),
    nc = evidenceCosts(n?.payments ?? [], "query");
  $(`#${prefix}price-comparison`).textContent =
    matches &&
    tc.confirmed &&
    nc.confirmed &&
    BigInt(tc.amount) > 0n &&
    BigInt(nc.amount) > 0n
      ? `Nansen’s read cost was ${ratio(nc.amount, tc.amount)}× Testril’s.`
      : "";
  $(`#${prefix}time-comparison`).textContent =
    matches && t.timing.query > 0 && n.timing.query > 0
      ? n.timing.query >= t.timing.query
        ? `Nansen took ${ratio(n.timing.query, t.timing.query)}× as long as Testril.`
        : `Testril took ${ratio(t.timing.query, n.timing.query)}× as long as Nansen.`
      : "";
}
function render() {
  current = reportFor(method);
  baseline = recordings[method];
  for (const which of ["transactions", "totals"]) renderSummary(which);
  for (const name of ["testril", "nansen"]) {
    const p = current?.providers[name];
    $(`#${name}-count`).textContent =
      p && (p.rows.length || p.status === "done")
        ? transferCount(p.rows, method)
        : "—";
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
  const comparison = complete
    ? method === "totals"
      ? compareCounterparties(t.rows, n.rows)
      : compare(t.rows, n.rows)
    : null;
  const matches = comparison?.matches;
  $("#agreement").textContent = complete
    ? matches
      ? method === "totals"
        ? comparison.amountsMatch === null
          ? "Every counterparty’s transfer count matches; Nansen did not supply all token amounts"
          : "Every counterparty count and amount matches"
        : "Every transfer and amount matches"
      : method === "totals"
        ? "The returned daily totals differ"
        : "The returned transfers differ"
    : !current && mode === "recorded"
      ? "No recording for this method yet. No prices or timings have been measured."
      : "Waiting for both complete answers";
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
  const report =
    current?.scope ??
    (mode === "recorded" ? recordings.transactions?.scope : null);
  $("#report-window").textContent = report
    ? `${report.from_time.slice(0, 10)} · ${report.from_time.slice(0, 10) === report.to_time.slice(0, 10) ? `${report.from_time.slice(11, 16)}–${report.to_time.slice(11, 16)} UTC` : "full UTC day"}`
    : mode === "live"
      ? `${$("#report-date").value || "Choose a day"} · full UTC day`
      : "";
  $("#download").disabled = !current;
  for (const button of document.querySelectorAll("[data-run-method]")) {
    button.hidden = mode !== "live";
    button.disabled =
      busy || storageBlocked || !payer || !validDate() || Boolean(pendingRun());
  }
  $("#connect").disabled = busy;
  $("#comparison-method").value = method;
  $("#comparison-method").disabled = busy || Boolean(pendingRun());
  $("#method-description").textContent =
    method === "totals"
      ? "Both providers return daily totals per counterparty. We compare every USDC transfer count and the exact token amounts when supplied by both."
      : "Both providers return every transfer; we compare the complete ledgers.";
  $("#ledger-title").textContent =
    method === "totals"
      ? "View the daily totals"
      : "View the full transfer ledger";
  $("#report-date").disabled = busy || Boolean(pendingRun());
  $("#recorded-controls").hidden = mode !== "recorded";
  $("#live-controls").hidden = mode !== "live";
  $("#recovery").hidden = !pendingRun();
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
  recordings.transactions = await api("recordings/day-2026-11-10.json");
  recordings.totals = await api("recordings/totals-2026-11-10.json").catch(
    () => null,
  );
  selectMode(mode);
}
function selectMode(next) {
  mode = next;
  current = reportFor(method);
  clearLedger();
  $("#notice").textContent = storageBlocked
    ? "Saved browser state could not be read. Live purchases are blocked until the previous state has been reviewed."
    : next === "live"
      ? (pendingRun()?.error ??
        current?.error ??
        "Choose a day and connect your wallet. Run each method separately below.")
      : "";
  render();
}
function approve(quote) {
  const dialog = $("#payment-dialog");
  $("#payment-summary").textContent =
    `${quote.provider === "testril" ? "Testril" : "Nansen"}: ${{ read: method === "totals" ? "retrieve daily totals" : "retrieve transfers", materialize: "prepare this day", provenance: "retrieve source evidence", "source-provenance": "retrieve transfer-source evidence", transactions: "retrieve one transaction page", counterparties: "retrieve one daily-totals page" }[quote.action]} · ${decimal(quote.amount)} USDC service charge.`;
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
for (const button of document.querySelectorAll("[data-run-method]"))
  button.addEventListener("click", async () => {
    if (busy || storageBlocked || !payer || !validDate() || pendingRun())
      return;
    method = button.dataset.runMethod;
    busy = true;
    $("#notice").textContent = "Starting comparison…";
    clearLedger();
    render();
    try {
      current = await runComparison({
        window: $("#report-date").value,
        method,
        payer,
        request: api,
        approve,
        sign: (q) =>
          signPayment(wallet, payer, q.challenge, q.accepted, q.plan),
        persist,
        onChange: (run) => {
          liveRuns[run.method] = run;
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
$("#comparison-method").addEventListener("change", () => {
  method = $("#comparison-method").value;
  selectMode(mode);
});
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
  if (!pendingRun()) return;
  const savedLive = structuredClone(pendingRun());
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
      await persist(savedLive);
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
  a.download = `pool-flows-${value.method ?? "transactions"}-${value.scope.window ?? value.scope.hour}-${value.status === "done" ? "run" : "attempt"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#download").addEventListener("click", () => downloadRun(current));
$("#download-pending").addEventListener("click", () =>
  downloadRun(pendingRun()),
);
async function restoreRuns() {
  try {
    journal = await openRunJournal();
    const runs = await journal.load();
    const legacy = localStorage.getItem(journalKey);
    const oldRun = legacy ? JSON.parse(legacy) : null;
    if (oldRun) {
      const stored = runs.find(
        (run) => run.method === (oldRun.method ?? "transactions"),
      );
      if (stored && stored.id !== oldRun.id)
        throw new Error("Conflicting saved runs");
      if (!stored) runs.push(oldRun);
    }
    for (const run of runs) {
      if (
        run?.schemaVersion !== 1 ||
        run.kind !== "live" ||
        !["testril", "nansen"].every(
          (name) =>
            Array.isArray(run.providers?.[name]?.rows) &&
            Array.isArray(run.providers[name].payments) &&
            run.providers[name].timing,
        )
      )
        throw new Error("Invalid saved run");
      run.method ??= "transactions";
      scope(run.scope.window ?? run.scope.hour, run.method);
      if (run.status === "running") {
        run.status = "stopped";
        run.error =
          "This run was interrupted. Check any pending purchase before another run.";
      }
      liveRuns[run.method] = run;
    }
    if (legacy) {
      await journal.save(liveRuns[oldRun.method ?? "transactions"]);
      localStorage.removeItem(journalKey);
    }
    storageBlocked = false;
    const pending = pendingRun();
    if (pending) {
      mode = "live";
      method = pending.method;
    }
    const latest =
      pending ??
      Object.values(liveRuns).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
    if (latest) $("#report-date").value = latest.scope.from_time.slice(0, 10);
  } catch {
    storageBlocked = true;
  }
}
storageBlocked = true;
selectMode(mode);
restoreRuns().then(() => {
  selectMode(mode);
});
loadRecording().catch(() => {
  $("#notice").textContent =
    "The recorded report could not be loaded. No paid requests were made.";
});
