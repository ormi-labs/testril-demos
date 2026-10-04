import { decimalAmount, parseUsd, usdAmount } from "./amounts.js";

const $ = (id) => document.getElementById(id);
let configuration;
let completed;
let busy = false;
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const label = (address) =>
  configuration.accounts.find((account) => account.address === address)
    ?.label ?? shortAddress(address);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path, input) {
  const response = await fetch(
    path,
    input
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}

function setBusy(value) {
  busy = value;
  $("run").disabled = value;
  $("verify").disabled = value;
  for (const control of $("scope-form").elements) control.disabled = value;
  $("run").textContent = value ? "Running…" : "Run sample";
}

function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

function svgElement(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function flowDiagram(run) {
  const rows = run.report.counterparties;
  if (!rows.length)
    return element(
      "p",
      "No transfers to other addresses in this range.",
      "muted",
    );
  const height = rows.length * 116 + 12;
  const svg = svgElement("svg", {
    viewBox: `0 0 440 ${height}`,
    role: "img",
    "aria-label":
      "Directed transfers between the selected treasury and its counterparties",
  });
  const defs = svgElement("defs", {});
  const marker = svgElement("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse",
  });
  marker.append(
    svgElement("path", { d: "M 0 0 L 10 5 L 0 10 Z", class: "flow-arrow" }),
  );
  defs.append(marker);
  svg.append(defs);
  rows.forEach((row, index) => {
    const y = index * 116 + 22;
    for (const [x, address] of [
      [4, run.inputs.treasury],
      [306, row.address],
    ]) {
      svg.append(
        svgElement("rect", {
          x,
          y,
          width: 130,
          height: 70,
          rx: 4,
          class: "flow-node",
        }),
      );
      svg.append(
        svgElement(
          "text",
          { x: x + 12, y: y + 26, class: "flow-label" },
          label(address),
        ),
      );
      svg.append(
        svgElement(
          "text",
          { x: x + 12, y: y + 48, class: "flow-address" },
          shortAddress(address),
        ),
      );
    }
    const outY = y + 18;
    const inY = y + 54;
    if (row.outgoingRaw !== "0") {
      svg.append(
        svgElement("path", {
          d: `M 134 ${outY} H 300`,
          class: "flow-path",
          "marker-end": "url(#arrow)",
        }),
      );
      svg.append(
        svgElement(
          "text",
          { x: 217, y: outY - 6, "text-anchor": "middle", class: "flow-value" },
          decimalAmount(row.outgoingRaw),
        ),
      );
    }
    if (row.incomingRaw !== "0") {
      svg.append(
        svgElement("path", {
          d: `M 306 ${inY} H 140`,
          class: "flow-path",
          "marker-end": "url(#arrow)",
        }),
      );
      svg.append(
        svgElement(
          "text",
          { x: 217, y: inY - 6, "text-anchor": "middle", class: "flow-value" },
          decimalAmount(row.incomingRaw),
        ),
      );
    }
  });
  return svg;
}

function render({ run, id }) {
  const { report, inputs, data, receipts } = run;
  const net = BigInt(report.netRaw);
  $("result-heading").textContent =
    net === 0n
      ? "The treasury’s balance did not change."
      : `The treasury’s balance ${net < 0n ? "fell" : "rose"} by ${decimalAmount(net < 0n ? -net : net)} USDC.`;
  $("completed-scope").textContent =
    `Completed sample · ${label(inputs.treasury)} · [${inputs.fromBlock}, ${inputs.toBlock})`;
  $("reconciliation").textContent = report.reconciles
    ? "Balances reconcile"
    : "Balance mismatch";
  for (const key of ["opening", "incoming", "outgoing", "net", "closing"])
    $(key).textContent = decimalAmount(
      report[`${key}Raw`],
      inputs.decimals,
      key === "net",
    );
  $("opening-block").textContent = `At block ${inputs.fromBlock - 1}`;
  for (const key of ["incoming", "outgoing"])
    $(key).setAttribute(
      "aria-label",
      `Inspect ${key} transfers: ${decimalAmount(report[`${key}Raw`], inputs.decimals)} USDC`,
    );
  $("closing-block").textContent = `At block ${inputs.toBlock - 1}`;
  $("self-note").textContent =
    `${report.selfTransfers} self-transfer event(s) excluded from incoming and outgoing; retained in the evidence.`;
  $("flow").replaceChildren(flowDiagram(run));
  $("counterparty-rows").replaceChildren(
    ...report.counterparties.map((row) => {
      const tr = element("tr");
      const name = element("td", label(row.address));
      name.append(
        element(
          "small",
          `${shortAddress(row.address)} · ${row.classification}`,
        ),
      );
      tr.append(
        name,
        ...["incoming", "outgoing", "net"].map((key) =>
          element(
            "td",
            decimalAmount(row[`${key}Raw`], inputs.decimals, key === "net"),
          ),
        ),
      );
      return tr;
    }),
  );
  if (!report.counterparties.length) {
    const row = element("tr");
    const cell = element("td", "No counterparties in this range.");
    cell.colSpan = 4;
    row.append(cell);
    $("counterparty-rows").append(row);
  }
  $("team-report").hidden = inputs.team.length === 0;
  $("team-summary").textContent =
    `External incoming: ${decimalAmount(report.team.incomingRaw)} USDC. External outgoing: ${decimalAmount(report.team.outgoingRaw)} USDC. Net team movement: ${decimalAmount(report.team.netRaw, 6, true)} USDC.`;
  $("edge-rows").replaceChildren(
    ...data.edges.map((row) => {
      const tr = element("tr");
      tr.append(
        ...[
          row.block,
          label(row.from),
          label(row.to),
          decimalAmount(row.amountRaw),
          row.amountRaw,
          row.transferCount,
        ].map((value) => element("td", value)),
      );
      return tr;
    }),
  );
  $("calculation").textContent =
    `${run.calculation.version}: ${run.calculation.description} Opening raw: ${data.openingRaw}; closing raw: ${data.closingRaw}.`;
  $("source-blocks").replaceChildren(
    ...run.provenance.blocks.map(({ block, hash }) =>
      element("li", `Block ${block}: ${hash}`),
    ),
  );
  $("verification").textContent =
    "Not checked. Run the verifier to compare rows, snapshots, source references, and arithmetic.";
  $("preparation").textContent = usdAmount(receipts.preparationRaw);
  $("preparation-detail").textContent =
    `${inputs.toBlock - inputs.fromBlock} edge blocks + two balance blocks. No preparation occurred.`;
  $("reads").textContent = usdAmount(receipts.readsRaw);
  $("remaining").textContent = usdAmount(receipts.remainingRaw);
  $("export").href = `/api/export?id=${encodeURIComponent(id)}`;
  for (const section of [
    "result",
    "evidence-section",
    "cost-section",
    "export",
  ])
    $(section).hidden = false;
}

async function runSample() {
  if (busy) return;
  setBusy(true);
  status("Calculating the sample…");
  try {
    const inputs = {
      ...configuration.inputs,
      treasury: $("treasury").value,
      fromBlock: Number($("from-block").value),
      toBlock: Number($("to-block").value),
      budgetRaw: parseUsd($("budget").value),
      team: $("team").checked ? [configuration.accounts[1].address] : [],
    };
    completed = await api("/api/run", inputs);
    render(completed);
    status("Sample complete. No payments were made.");
  } catch (error) {
    status(
      `${error.message}${completed ? " The previous completed result is still shown." : ""}`,
      true,
    );
  } finally {
    setBusy(false);
  }
}

$("scope-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runSample();
});
$("scope-form").addEventListener("input", () => {
  if (completed)
    status(
      "Settings changed. Run the sample to update the result; the completed result below uses the previous settings.",
    );
});
$("verify").addEventListener("click", async () => {
  if (busy || !completed) return;
  setBusy(true);
  $("verify").textContent = "Checking…";
  try {
    const verification = await api("/api/verify", { id: completed.id });
    completed.run.verification = verification;
    const list = element("ul", undefined, "check-list");
    for (const check of verification.checks)
      list.append(element("li", `${check.passed ? "✓" : "✕"} ${check.name}`));
    $("verification").replaceChildren(
      element(
        "p",
        verification.status === "passed"
          ? "Sample checks passed."
          : "Sample checks failed.",
      ),
      list,
      element("p", verification.reference, "muted"),
    );
  } catch (error) {
    $("verification").textContent = error.message;
  } finally {
    setBusy(false);
    $("verify").textContent = "Verify sample";
  }
});

for (const key of ["incoming", "outgoing"])
  $(key).addEventListener("click", () => {
    $("evidence").open = true;
    $("evidence").scrollIntoView({ block: "start" });
    $("evidence").querySelector("summary").focus();
  });

$("discover").addEventListener("click", async () => {
  $("discover").disabled = true;
  $("discovery-status").textContent =
    "Inspecting the deployed function catalog…";
  try {
    const result = await api("/api/discover");
    $("catalog").textContent = JSON.stringify(result.catalog, null, 2);
    $("catalog").hidden = false;
    $("discovery-status").textContent = `Catalog checked. ${result.note}`;
  } catch (error) {
    $("discovery-status").textContent = error.message;
  } finally {
    $("discover").disabled = false;
  }
});

try {
  configuration = await api("/api/config");
  for (const account of configuration.accounts) {
    const option = element("option", account.label);
    option.value = account.address;
    $("treasury").append(option);
  }
  await runSample();
} catch (error) {
  status(error.message, true);
  $("run").disabled = true;
}
