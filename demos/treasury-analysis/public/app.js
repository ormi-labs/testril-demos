import { decimalAmount, feeAmount, parseUsdc } from "./amounts.js";
import { replayBalances } from "./replay.js";
import { transferDiagram } from "./transfer-diagram.js";

const $ = (id) => document.getElementById(id);
const storageKey = "testril-wallet-demo-v2";
let state;
let busy = false;
let history;
let step = 0;
let timer;
let selected;
const name = (id) => state.wallets.find((wallet) => wallet.id === id).name;
const time = (timestamp) =>
  `${new Date(timestamp).toISOString().slice(11, 19)} UTC`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

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
      renderState();
    }
    throw new Error(result.error ?? "Request failed.");
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
  for (const id of ["show", "reset", "play", "restart-replay", "replay-step"])
    $(id).disabled = value;
  if (!value && state) updateAvailable();
}
function updateAvailable() {
  if ($("from").value === $("to").value)
    $("to").value = state.wallets.find(
      (wallet) => wallet.id !== $("from").value,
    ).id;
  for (const option of $("to").options)
    option.disabled = option.value === $("from").value;
  $("available").textContent =
    `${decimalAmount(state.balances[$("from").value])} USDC available`;
  let amount;
  try {
    amount = decimalAmount(parseUsdc($("amount").value));
  } catch {
    /* Keep the action usable while editing. */
  }
  $("transfer").textContent = amount ? `Send ${amount} USDC` : "Send USDC";
}
function renderState() {
  $("wallets").replaceChildren(
    ...state.wallets.map((wallet) => {
      const card = element("article", undefined, "panel wallet");
      const balance = element(
        "strong",
        decimalAmount(state.balances[wallet.id]),
      );
      balance.id = `balance-${wallet.id}`;
      const value = element("div", undefined, "wallet-value");
      value.append(balance, element("small", "USDC"));
      value.classList.toggle(
        "precise-value",
        decimalAmount(state.balances[wallet.id]).length > 6,
      );
      const meter = element("meter");
      meter.min = 0;
      meter.max = 1;
      meter.value = Number(state.balances[wallet.id]) / 1000000;
      meter.setAttribute("aria-label", `${wallet.name}: share of the 1 USDC`);
      card.append(element("h3", wallet.name, "wallet-name"), value, meter);
      return card;
    }),
  );
  $("balance-block").textContent = `Block ${state.balanceRead.block}`;
  $("run-label").textContent = `Run ${state.cycle}`;
  $("show").textContent = `Show transfers (${state.transferCount})`;
  $("show").classList.toggle("has-transfers", state.transferCount > 0);
  $("spent").textContent = feeAmount(state.payment.spentRaw);
  $("payment-spent").textContent = feeAmount(state.payment.spentRaw);
  $("payment-left").textContent = feeAmount(state.payment.remainingRaw);
  $("read-count").textContent = state.payment.requestCount;
  $("receipt-rows").replaceChildren(
    ...state.receipts.map((receipt) => {
      const row = element("tr");
      row.append(
        ...[
          receipt.id,
          receipt.kind,
          receipt.requestCount,
          feeAmount(receipt.chargeRaw),
        ].map((value) => element("td", value)),
      );
      return row;
    }),
  );
  $("export").hidden = false;
  $("export").href = endpoint("export");
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
        : [
            element(
              "li",
              "All funds were already in the treasury. No return transfers were needed.",
            ),
          ]),
    );
  if (history)
    $("history-stale").hidden =
      history.transfers.length === state.transferCount;
  updateAvailable();
}
function stop() {
  clearInterval(timer);
  timer = undefined;
  $("play").textContent = "Play";
}
function closeProvenance() {
  $("provenance").close();
  $("provenance").hidden = true;
  const previous = selected;
  selected = undefined;
  if (history) renderReplay();
  if (previous)
    document.querySelector(`[data-transfer="${previous}"]`)?.focus();
}
function closeHistory() {
  stop();
  closeProvenance();
  history = undefined;
  $("history").hidden = true;
}
function renderReplay() {
  const balances = replayBalances(
    state.initialBalances,
    history.transfers,
    step,
  );
  $("transfer-diagram").replaceChildren(
    transferDiagram({
      wallets: state.wallets,
      balances,
      transfers: history.transfers,
      visibleCount: step,
      selected,
      onSelect: inspect,
    }),
  );
  $("replay-caption").textContent =
    `Replay balances · step ${step} of ${history.transfers.length}`;
  $("step-label").textContent = `${step} / ${history.transfers.length}`;
  $("replay-step").value = step;
  $("replay-start").hidden = step > 0 || history.transfers.length === 0;
  $("empty-history").hidden = history.transfers.length !== 0;
  $("replay-controls").hidden = history.transfers.length === 0;
}
function play() {
  if (!history?.transfers.length || busy) return;
  if (timer) {
    stop();
    return;
  }
  if (step === history.transfers.length) step = 0;
  closeProvenance();
  renderReplay();
  $("play").textContent = "Pause";
  timer = setInterval(() => {
    step += 1;
    renderReplay();
    if (step === history.transfers.length) stop();
  }, 800);
}
async function inspect(transfer) {
  if (busy) return;
  stop();
  selected = transfer.id;
  renderReplay();
  lock(true);
  try {
    const result = await api(
      `${endpoint("provenance")}?transfer=${encodeURIComponent(transfer.id)}`,
    );
    const list = element("dl");
    for (const [label, value] of [
      ["Function", `${result.function.name} · ${result.function.version}`],
      [
        "Network / token",
        `${result.chain.name} (${result.chain.id}) / ${result.token.symbol}`,
      ],
      ["Block range", `[${result.range.fromBlock}, ${result.range.toBlock})`],
      ["Time", result.source.timestamp],
      ["From", result.source.from],
      ["To", result.source.to],
      [
        "Amount",
        `${decimalAmount(result.source.amountRaw)} USDC · ${result.source.amountRaw} raw units`,
      ],
      ["Block hash", result.source.blockHash],
      ["Transaction hash", result.source.transactionHash],
      ["Log index", result.source.logIndex],
      ["Calculation", result.calculation.description],
    ])
      list.append(element("dt", label), element("dd", value, "hash"));
    $("provenance-content").replaceChildren(
      list,
      element("p", result.note, "small muted"),
    );
    $("provenance").hidden = false;
    $("provenance").showModal();
    $("provenance-heading").focus({ preventScroll: true });
  } catch (error) {
    status(error.message, true);
  } finally {
    lock(false);
  }
}
async function action(kind) {
  if (busy) return;
  stop();
  lock(true);
  status(
    kind === "transfer"
      ? "Sending and reading balances…"
      : kind === "reset"
        ? "Returning funds…"
        : "Reading transfers…",
  );
  if (kind === "transfer") $("transfer").textContent = "Sending…";
  let loadedHistory = false;
  try {
    const input = { revision: state.revision };
    if (kind === "transfer")
      Object.assign(input, {
        from: $("from").value,
        to: $("to").value,
        amount: $("amount").value,
      });
    const result = await api(endpoint(kind), input);
    state = kind === "history" ? result.state : result;
    if (kind === "reset") closeHistory();
    renderState();
    if (kind === "history") {
      closeProvenance();
      history = result.history;
      loadedHistory = true;
      step = 0;
      $("history").hidden = false;
      $("history-stale").hidden = true;
      $("history-scope").textContent = `Run ${state.cycle} · Arbitrum`;
      $("history-note").textContent =
        `${history.transfers.length} transfers · ${feeAmount(history.chargeRaw)} USDC read`;
      $("replay-step").max = history.transfers.length;
      renderReplay();
      $("history-heading").focus({ preventScroll: true });
      $("history").scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
    status(
      kind === "reset"
        ? "Reset. Treasury has 1 USDC."
        : kind === "history"
          ? "History ready."
          : "Sent. Balances updated.",
    );
  } catch (error) {
    status(error.message, true);
  } finally {
    lock(false);
  }
  if (
    loadedHistory &&
    history &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    play();
}
$("transfer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  action("transfer");
});
$("from").addEventListener("change", updateAvailable);
$("all").addEventListener("click", () => {
  $("amount").value = decimalAmount(state.balances[$("from").value]);
  updateAvailable();
});
$("amount").addEventListener("input", updateAvailable);
$("show").addEventListener("click", () => action("history"));
$("reset").addEventListener("click", () => action("reset"));
$("play").addEventListener("click", play);
$("restart-replay").addEventListener("click", () => {
  stop();
  closeProvenance();
  step = 0;
  renderReplay();
  play();
});
$("replay-step").addEventListener("input", () => {
  const next = Number($("replay-step").value);
  stop();
  closeProvenance();
  step = next;
  renderReplay();
});
$("close-history").addEventListener("click", () => {
  closeHistory();
  $("show").focus();
});
$("close-provenance").addEventListener("click", closeProvenance);
$("payment-details").addEventListener("click", () => {
  $("payments").showModal();
  $("payment-heading").focus({ preventScroll: true });
});
$("close-payments").addEventListener("click", () => $("payments").close());
$("provenance").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeProvenance();
});

try {
  let saved;
  try {
    saved = sessionStorage.getItem(storageKey);
  } catch {
    /* Storage is optional. */
  }
  if (saved) {
    try {
      state = await api(`/api/sessions/${encodeURIComponent(saved)}`);
    } catch {
      /* An expired mock session starts fresh. */
    }
  }
  state ??= await api("/api/sessions", {});
  try {
    sessionStorage.setItem(storageKey, state.id);
  } catch {
    /* Storage is optional. */
  }
  for (const id of ["from", "to"])
    $(id).replaceChildren(
      ...state.wallets.map((wallet) => {
        const option = element("option", wallet.name);
        option.value = wallet.id;
        return option;
      }),
    );
  $("to").value = "a";
  renderState();
  lock(false);
  status("");
} catch (error) {
  status(error.message, true);
  lock(true);
}
