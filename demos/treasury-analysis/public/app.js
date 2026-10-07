import { formatTransferTiming } from "./timing.js";
import { decimalAmount, feeAmount } from "./amounts.js";
import { replayBalances } from "./replay.js";
import { transferDiagram } from "./transfer-diagram.js";

const $ = (id) => document.getElementById(id);
const storageKey = "testril-wallet-demo-v3";
let state;
let busy = false;
let step = 0;
let timer;
let selected;
let provenanceTrigger;
let mode = "mock";
const name = (id) => state.wallets.find((wallet) => wallet.id === id).name;
const time = (timestamp) =>
  `${new Date(timestamp).toISOString().slice(11, 19)} UTC`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function hideCostBreakdown() {
  $("cost-breakdown").hidden = true;
}
function costButton(raw, breakdown) {
  const button = element("button", feeAmount(raw), "cost");
  button.type = "button";
  button.setAttribute("aria-label", `${feeAmount(raw)} USDC. ${breakdown}`);
  const show = () => {
    const tooltip = $("cost-breakdown");
    tooltip.textContent = breakdown;
    tooltip.hidden = false;
    const rect = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(rect.right - tooltip.offsetWidth, innerWidth - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${rect.top >= tooltip.offsetHeight + 12 ? rect.top - tooltip.offsetHeight - 8 : rect.bottom + 8}px`;
  };
  button.addEventListener("mouseenter", show);
  button.addEventListener("focus", show);
  button.addEventListener("click", show);
  button.addEventListener("mouseleave", hideCostBreakdown);
  button.addEventListener("blur", hideCostBreakdown);
  return button;
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCostBreakdown();
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".cost")) hideCostBreakdown();
});
window.addEventListener("scroll", hideCostBreakdown, true);
window.addEventListener("resize", hideCostBreakdown);
async function api(path, input) {
  const response = await fetch(
    path,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
  );
  const result = await response.json();
  if (!response.ok) {
    if (result.state) {
      state = result.state;
      step = state.historyRead.transfers.length;
      renderState();
    }
    const error = new Error(result.error ?? "Request failed.");
    error.timing = result.timing;
    throw error;
  }
  return result;
}
const endpoint = (action = "") =>
  `/api/sessions/${state.id}${action ? `/${action}` : ""}`;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function lock(value) {
  busy = value;
  $("transfer-form").setAttribute("aria-busy", String(value));
  for (const control of $("transfer-form").elements) control.disabled = value;
  for (const id of ["reset", "play", "refresh-live"]) $(id).disabled = value;
  for (const input of document.querySelectorAll('[name="data-mode"]'))
    input.disabled = value || (input.value === "live" && !liveAvailable);
  for (const balance of document.querySelectorAll("[data-balance]"))
    balance.disabled =
      value ||
      (state?.mode === "live" &&
        state.balanceRead.balances[balance.dataset.balance] === null);
  if (!value && state) updateRecipients();
  if (!value && state?.mode === "live" && state.refreshNeeded)
    $("transfer").disabled = true;
}
const selectedWallet = (id) => $(id).querySelector("input:checked").value;
function updateRecipients() {
  const sender = selectedWallet("from");
  if (sender === selectedWallet("to"))
    $("to").querySelector(`input:not([value="${sender}"])`).checked = true;
  for (const input of $("to").querySelectorAll("input"))
    input.disabled = input.value === sender;
}
function renderState() {
  hideCostBreakdown();
  const live = state.mode === "live";
  $("testril-server").textContent = live ? state.mcpUrl : "";
  $("testril-server").hidden = !live;
  $("network-name").textContent = state.chain.name;
  $("refresh-live").hidden = !live;
  $("balances-heading").textContent = live ? "Wallet balances" : "Balances";
  const balances = live ? state.balanceRead.balances : state.balances;
  const total = Object.values(balances).reduce(
    (sum, value) => sum + BigInt(value ?? "0"),
    0n,
  );
  const complete = Object.values(balances).every((value) => value !== null);
  $("cost-label").textContent = live
    ? "Total Testril cost · USDC"
    : "Total read cost · USDC";
  $("operation-label").textContent = live ? "Operation" : "Read";
  $("reset-note").textContent = live
    ? "Reset returns the demo funds to Treasury and starts new histories. Earlier payments, escrow, and spending caps remain saved."
    : "Reset clears both histories and restores the mock payment wallet.";
  $("wallets").replaceChildren(
    ...state.wallets.map((wallet) => {
      const card = element("button", undefined, "panel wallet");
      card.type = "button";
      card.dataset.balance = wallet.id;
      card.id = `wallet-${wallet.id}`;
      const raw = balances[wallet.id];
      const display = raw === null ? "Not yet read" : decimalAmount(raw);
      card.disabled = busy || raw === null;
      card.setAttribute(
        "aria-label",
        `${wallet.name} balance: ${display}${raw === null ? "" : " USDC. Show provenance."}`,
      );
      const balance = element("strong", display);
      balance.id = `balance-${wallet.id}`;
      const value = element("span", undefined, "wallet-value");
      value.append(balance);
      if (raw !== null) value.append(element("small", "USDC"));
      value.classList.toggle("precise-value", display.length > 6);
      const meter = element("meter");
      meter.min = 0;
      meter.max = 100;
      const percent =
        total > 0n && raw !== null
          ? Number((BigInt(raw) * 10000n + total / 2n) / total) / 100
          : 0;
      meter.value = percent;
      meter.setAttribute(
        "aria-label",
        `${wallet.name} share of displayed wallet total`,
      );
      const share = element("span", undefined, "wallet-share");
      share.hidden = !complete;
      share.append(meter);
      card.append(
        element("span", wallet.name, "wallet-name"),
        value,
        share,
        element("small", wallet.address, "wallet-address"),
      );
      card.addEventListener("click", () => inspect("balance", wallet));
      return card;
    }),
  );
  $("transfer-count").textContent = state.transferCount;
  $("payment-count").textContent = state.receipts.length;
  const balanceCost = state.receipts
    .filter((receipt) => receipt.kind === "balances")
    .reduce((total, receipt) => total + BigInt(receipt.chargeRaw), 0n);
  const historyCost = BigInt(state.payment.spentRaw) - balanceCost;
  $("spent").replaceChildren(
    costButton(
      state.payment.spentRaw,
      live
        ? `Testril charges this run: ${feeAmount(state.payment.spentRaw)} USDC\nEscrow deposited separately: ${feeAmount(state.payment.depositedRaw)} USDC\nGas is paid separately in ETH`
        : `Balance reads: ${feeAmount(balanceCost.toString())} USDC\nTransfer history reads: ${feeAmount(historyCost.toString())} USDC\nMock rates`,
    ),
  );
  const materializations = state.receipts.filter(
    (r) => r.kind === "materialization",
  );
  const reads = state.receipts.filter((r) => r.kind !== "materialization");
  const readCount = reads.reduce((sum, r) => sum + r.requestCount, 0);
  const readCost = reads
    .reduce((sum, r) => sum + BigInt(r.chargeRaw), 0n)
    .toString();
  const materializationCost = materializations
    .reduce((sum, r) => sum + BigInt(r.chargeRaw), 0n)
    .toString();
  $("read-count").textContent = readCount;
  $("materialization-count").textContent = materializations.length;
  $("read-cost").replaceChildren(
    costButton(
      readCost,
      `${readCount} read requests: ${feeAmount(readCost)} USDC`,
    ),
  );
  $("materialization-cost").replaceChildren(
    costButton(
      materializationCost,
      `${materializations.length} materializations: ${feeAmount(materializationCost)} USDC`,
    ),
  );
  $("receipt-rows").replaceChildren(
    ...state.receipts.toReversed().map((receipt) => {
      const row = element("tr");
      row.append(
        ...[
          time(receipt.timestamp),
          receipt.block,
          live
            ? receipt.kind === "materialization"
              ? "Materialization"
              : "Read"
            : receipt.kind === "balances"
              ? "Balances"
              : "Transfer history",
          receipt.requestCount,
        ].map((value) => element("td", value)),
      );
      const cost = element("td");
      const breakdown = live
        ? receipt.lines
            .map(
              (line) =>
                `${line.label}: ${line.units} × ${line.unit_price} USDC`,
            )
            .join("\n") + `\nPayment: ${receipt.status}\nQuote: ${receipt.id}`
        : receipt.kind === "balances"
          ? `${receipt.requestCount} balance reads × ${feeAmount(state.rates.balanceReadRaw)} USDC`
          : `History read: ${feeAmount(state.rates.transferReadBaseRaw)} USDC\nTransfer rows: ${feeAmount((BigInt(receipt.chargeRaw) - BigInt(state.rates.transferReadBaseRaw)).toString())} USDC (${feeAmount(state.rates.transferReadPerRowRaw)} per transfer)`;
      cost.append(
        costButton(
          receipt.chargeRaw,
          `${breakdown}\nTotal: ${feeAmount(receipt.chargeRaw)} USDC${live ? "" : "\nMock rates"}`,
        ),
      );
      row.append(cost);
      return row;
    }),
  );
  $("reset-evidence").hidden = !state.lastReset;
  if (state.lastReset)
    $("reset-sweeps").replaceChildren(
      ...(state.lastReset.sweeps.length
        ? state.lastReset.sweeps.map((transfer) =>
            element(
              "li",
              `${name(transfer.from)} → Treasury: ${decimalAmount(transfer.amountRaw)} USDC · ${time(transfer.timestamp)} · block ${transfer.block}`,
            ),
          )
        : [element("li", "All funds were already in the treasury.")]),
    );
  renderReplay();
  updateRecipients();
}
function stop() {
  clearInterval(timer);
  timer = undefined;
  $("play").textContent =
    state && step === state.transferCount ? "Replay" : "Play";
}
function closeProvenance() {
  $("provenance").close();
  selected = undefined;
  if (state) renderReplay();
  if (provenanceTrigger) document.querySelector(provenanceTrigger)?.focus();
  provenanceTrigger = undefined;
}
function renderReplay() {
  const history = state.historyRead;
  const live = state.mode === "live";
  const balances = live
    ? state.balanceRead.balances
    : replayBalances(state.initialBalances, history.transfers, step);
  const empty = history.transfers.length === 0;
  $("transfer-diagram").hidden = empty;
  $("transfer-help").hidden = empty;
  $("replay-caption").hidden = empty;
  $("empty-history").hidden = !empty;
  $("replay-controls").hidden = empty;
  $("transfer-diagram").replaceChildren(
    ...(empty
      ? []
      : [
          transferDiagram({
            wallets: state.wallets,
            balances,
            transfers: history.transfers,
            visibleCount: step,
            selected,
            onSelect: (transfer) => inspect("transfer", transfer),
          }),
        ]),
  );
  $("replay-caption").textContent = live
    ? `Last Testril wallet reads · transfers ${step} of ${history.transfers.length}`
    : step === history.transfers.length
      ? "Latest balances and transfers"
      : `Replay balances · step ${step} of ${history.transfers.length}`;
}
function play() {
  if (!state.transferCount || busy) return;
  if (timer) {
    stop();
    return;
  }
  closeProvenance();
  if (step === state.transferCount) step = 0;
  renderReplay();
  $("play").textContent = "Pause";
  timer = setInterval(() => {
    step += 1;
    renderReplay();
    if (step === state.transferCount) stop();
  }, 800);
}
async function inspect(kind, item) {
  if (busy) return;
  stop();
  provenanceTrigger =
    kind === "balance" ? `#wallet-${item.id}` : `[data-transfer="${item.id}"]`;
  if (kind === "transfer") {
    selected = item.id;
    renderReplay();
  }
  lock(true);
  try {
    const path =
      kind === "balance"
        ? `${endpoint("balance-provenance")}?wallet=${item.id}`
        : `${endpoint("provenance")}?transfer=${item.id}`;
    const result = await api(path);
    $("source-note").textContent =
      result.mode === "live"
        ? kind === "balance"
          ? "Base Sepolia · Testril wallet balance and block citation"
          : "Base Sepolia · RPC receipt and Testril block citation"
        : "Mock source evidence · not verified on Arbitrum";
    const rows =
      kind === "balance"
        ? [
            ["Wallet", result.source.wallet],
            ["Address", result.source.address],
            [
              "Balance",
              `${decimalAmount(result.source.balanceRaw)} USDC · ${result.source.balanceRaw} raw units`,
            ],
            ["Source block", result.source.block],
          ]
        : [
            ["From", result.source.from],
            ["To", result.source.to],
            [
              "Amount",
              `${decimalAmount(result.source.amountRaw)} USDC · ${result.source.amountRaw} raw units`,
            ],
            [
              "Block range",
              `[${result.range.fromBlock}, ${result.range.toBlock})`,
            ],
            ["Transaction hash", result.source.transactionHash],
            ["Log index", result.source.logIndex],
          ];
    rows.push(
      ["Function", `${result.function.name} · ${result.function.version}`],
      [
        "Network / token",
        `${result.chain.name} (${result.chain.id}) / ${result.token.symbol}`,
      ],
      ["Token contract", result.token.address],
      ["Calculation", result.calculation.description],
    );
    if (result.source.timestamp) rows.push(["Time", result.source.timestamp]);
    if (result.source.blockHash)
      rows.push(["Block hash", result.source.blockHash]);
    if (result.mode === "live") {
      rows.push([
        "Testril computation",
        JSON.stringify(result.citation.computation),
      ]);
      if (result.citation.digest)
        rows.push(["Testril source digest", result.citation.digest]);
      if (result.edge)
        rows.push([
          "Pair total in this block",
          `${decimalAmount(result.edge.amount)} USDC in ${result.edge.count} events`,
        ]);
    }
    const list = element("dl");
    for (const [label, value] of rows)
      list.append(element("dt", label), element("dd", value, "hash"));
    $("provenance-heading").textContent =
      kind === "balance" ? "Balance provenance" : "Transfer provenance";
    $("provenance-content").replaceChildren(
      list,
      element("p", result.note, "small muted"),
    );
    $("provenance").showModal();
    $("provenance-heading").focus({ preventScroll: true });
  } catch (error) {
    status(error.message, true);
  } finally {
    lock(false);
  }
}
function showTransferProgress(input, started) {
  const dialog = $("transfer-progress");
  const controller = new AbortController();
  const progressUrl = endpoint("progress");
  const labels = {
    prepare: "RPC: Preparing Transfer",
    broadcast: "RPC: Submitting Transfer",
    confirm: "RPC: Confirming Transfer",
    materialize: "Materializing Data",
    pay: "Paying",
    read: "Reading Data",
  };
  const render = (steps, phases = {}) => {
    for (const key of ["rpc", "testril"]) {
      const phase = phases[key];
      $(`${key}-progress-elapsed`).textContent = phase?.started
        ? `${(phase.elapsedMs / 1000).toFixed(1)}s`
        : "Pending";
    }
    const active = [];
    for (const row of dialog.querySelectorAll("[data-progress]")) {
      const key = row.dataset.progress;
      const step = steps[key] ?? {};
      row.classList.toggle("active", step.active > 0);
      row.classList.toggle("complete", !!step.complete);
      row.querySelector(".progress-state").textContent = step.complete
        ? step.started
          ? "Complete"
          : "Not needed"
        : step.active > 0
          ? "In progress"
          : step.started
            ? "Waiting"
            : "Pending";
      if (step.active > 0) active.push(labels[key]);
    }
    const announcement = active.length
      ? active.join(". ")
      : "Waiting for the next step.";
    if ($("progress-activity").textContent !== announcement)
      $("progress-activity").textContent = announcement;
  };
  $("progress-summary").textContent =
    `${input.amount} USDC · ${name(input.from)} → ${name(input.to)}`;
  const elapsed = () => {
    $("progress-elapsed").textContent =
      `${((performance.now() - started) / 1000).toFixed(1)}s elapsed`;
  };
  elapsed();
  render({});
  dialog.showModal();
  $("progress-heading").focus({ preventScroll: true });
  const clock = setInterval(elapsed, 100);
  // Poll only this local server; progress never triggers a Testril request.
  const poll = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(progressUrl, {
          signal: controller.signal,
        });
        if (response.ok) {
          const progress = await response.json();
          if (
            !controller.signal.aborted &&
            progress?.revision === input.revision &&
            progress.outcome === "running"
          )
            render(progress.steps, progress.phases);
        }
      } catch {
        // The transfer response remains authoritative if progress is unavailable.
      }
      if (!controller.signal.aborted)
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  poll();
  return () => {
    controller.abort();
    clearInterval(clock);
    dialog.close();
  };
}
$("transfer-progress").addEventListener("cancel", (event) =>
  event.preventDefault(),
);

async function action(kind) {
  if (busy) return;
  const started = performance.now();
  const timedSend = kind === "transfer" && state.mode === "live";
  let timing;
  let closeProgress;
  stop();
  lock(true);
  status(
    state.mode === "live" && !timedSend
      ? "Waiting for Base Sepolia and Testril…"
      : "",
  );
  try {
    const input = { revision: state.revision };
    if (kind === "transfer")
      Object.assign(input, {
        from: selectedWallet("from"),
        to: selectedWallet("to"),
        amount: $("amount").value,
      });
    if (timedSend) closeProgress = showTransferProgress(input, started);
    state = await api(endpoint(kind), input);
    timing = state.timing;
    selected = undefined;
    step = state.transferCount;
    renderState();
    stop();
    status("");
  } catch (error) {
    timing = error.timing;
    status(error.message, true);
  } finally {
    closeProgress?.();
    lock(false);
    if (timedSend)
      ($("transfer").disabled ? $("status") : $("transfer")).focus({
        preventScroll: true,
      });
    if (timedSend && timing) {
      const elapsedMs = performance.now() - started;
      console.info(formatTransferTiming(timing, elapsedMs));
      fetch("/api/timings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: timing.id, elapsedMs }),
      }).catch(() => {});
    }
  }
}
function activateTab(id) {
  hideCostBreakdown();
  stop();
  if (state) {
    step = state.transferCount;
    renderReplay();
    stop();
  }
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const active = tab.id === id;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !active;
  }
}
const tabs = [$("transfer-tab"), $("payment-tab")];
for (const tab of tabs) {
  tab.addEventListener("click", () => activateTab(tab.id));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs[1]
          : tabs.find((candidate) => candidate !== tab);
    activateTab(target.id);
    target.focus();
  });
}
$("transfer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  action("transfer");
});
$("from").addEventListener("change", updateRecipients);
$("reset").addEventListener("click", () => action("reset"));
$("refresh-live").addEventListener("click", () => action("refresh"));
$("play").addEventListener("click", play);
$("close-provenance").addEventListener("click", closeProvenance);
$("provenance").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeProvenance();
});

let liveAvailable = false;
let liveServerUrl;
async function start(nextMode) {
  stop();
  lock(true);
  mode = nextMode;
  for (const input of document.querySelectorAll('[name="data-mode"]'))
    input.checked = input.value === mode;
  state = undefined;
  $("testril-server").textContent = nextMode === "live" ? liveServerUrl : "";
  $("testril-server").hidden = nextMode !== "live" || !liveServerUrl;
  $("network-name").textContent = mode === "live" ? "Base Sepolia" : "Arbitrum";
  $("balances-heading").textContent =
    mode === "live" ? "Wallet balances" : "Balances";
  $("wallets").replaceChildren(
    element(
      "p",
      "Balances unavailable until the session opens.",
      "small muted",
    ),
  );
  $("refresh-live").hidden = mode !== "live";
  document.querySelector(".histories").hidden = true;
  status(mode === "live" ? "Opening the shared Base Sepolia session…" : "");
  try {
    let saved;
    try {
      saved = sessionStorage.getItem(`${storageKey}-${mode}`);
    } catch {
      /* Storage is optional. */
    }
    if (saved) {
      try {
        state = await api(`/api/sessions/${encodeURIComponent(saved)}`);
      } catch {
        /* Expired sessions start fresh. */
      }
    }
    state ??= await api("/api/sessions", mode === "live" ? { mode } : {});
    try {
      sessionStorage.setItem(`${storageKey}-${mode}`, state.id);
    } catch {
      /* Storage is optional. */
    }
    for (const id of ["from", "to"])
      $(id)
        .querySelector(".wallet-options")
        .replaceChildren(
          ...state.wallets.map((wallet) => {
            const label = element("label");
            const input = element("input");
            input.type = "radio";
            input.name = id;
            input.value = wallet.id;
            input.required = true;
            input.checked = wallet.id === (id === "from" ? "treasury" : "a");
            input.setAttribute("aria-label", wallet.name);
            label.append(
              input,
              element(
                "span",
                wallet.id === "treasury" ? "Treasury" : wallet.id.toUpperCase(),
              ),
            );
            return label;
          }),
        );
    step = state.transferCount;
    renderState();
    document.querySelector(".histories").hidden = false;
    stop();
    lock(false);
    status(
      state.mode === "live" && state.refreshNeeded
        ? "Select Refresh to prepare and read the snapshot with Testril."
        : "",
    );
  } catch (error) {
    status(error.message, true);
    lock(true);
    for (const input of document.querySelectorAll('[name="data-mode"]'))
      input.disabled = input.value === "live" && !liveAvailable;
  }
}
for (const input of document.querySelectorAll('[name="data-mode"]'))
  input.addEventListener("change", () => start(input.value));
try {
  const config = await api("/api/config");
  liveAvailable = config.liveAvailable;
  liveServerUrl = config.mcpUrl;
  $("live-option").title =
    config.liveReason ?? "Live Base Sepolia with local signing";
} catch {
  /* Mock mode can still start. */
}
await start(liveAvailable ? "live" : "mock");
