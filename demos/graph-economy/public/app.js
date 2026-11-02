const svgNs = "http://www.w3.org/2000/svg";

function svg(name, attributes = {}, text) {
  const node = document.createElementNS(svgNs, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function element(name, text, className) {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function banner(report) {
  const node = document.querySelector("#source");
  if (report.source === "synthetic") {
    node.textContent = "Synthetic fixture — not real data";
    node.classList.add("synthetic");
  } else
    node.textContent = `Recorded from Testril on ${report.recordedAt.slice(0, 10)}`;
}

function metric(label, value, note) {
  const node = element("div");
  node.append(element("span", label, "label"), element("strong", value));
  if (note) node.append(element("span", note));
  return node;
}

function barChart(epochs) {
  const width = 1000;
  const height = 260;
  const pad = { left: 56, right: 12, top: 16, bottom: 30 };
  const max = Math.max(...epochs.map((epoch) => epoch.thousands));
  const slot = (width - pad.left - pad.right) / epochs.length;
  const baseline = height - pad.bottom;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Query fees collected per epoch",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: baseline,
      y2: baseline,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 8, y: pad.top + 4, class: "tick end" },
      `${max.toFixed(1)}K`,
    ),
    svg("text", { x: pad.left - 8, y: baseline, class: "tick end" }, "0"),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      `epoch ${epochs[0].epoch}`,
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      `epoch ${epochs.at(-1).epoch}`,
    ),
  );
  epochs.forEach((epoch, index) => {
    const barHeight = (epoch.thousands / max) * (baseline - pad.top);
    const bar = svg("rect", {
      x: pad.left + index * slot + 1,
      y: baseline - barHeight,
      width: Math.max(slot - 2, 1),
      height: barHeight,
      class: "bar",
    });
    bar.append(svg("title", {}, `epoch ${epoch.epoch}: ${epoch.total}`));
    chart.append(bar);
  });
  return chart;
}

function indexerRow(indexer) {
  const row = element("tr");
  row.append(
    element("td", String(indexer.rank)),
    element("td", indexer.label),
    element("td", indexer.rewards),
    element("td", indexer.delegatorRewards),
    element("td", indexer.delegatorShare),
    element("td", indexer.pool),
    element("td", indexer.delegatorYield),
  );
  return row;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_block}–${view.window.to_block - 1}`;
  document.querySelector("#epochs").textContent =
    `${view.epochs.first} to ${view.epochs.last}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("INDEXING REWARDS", view.rewards),
      metric("TO DELEGATORS", view.delegatorShare, "of all rewards"),
      metric(
        "NET DELEGATION",
        view.netDelegation,
        "delegated minus undelegated",
      ),
      metric("QUERY FEES", view.queryFees),
    );
  document
    .querySelector("#fees-chart")
    .replaceChildren(barChart(view.queryFeesPerEpoch));
  document
    .querySelector("#indexers")
    .replaceChildren(...view.indexers.map(indexerRow));
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(report.checks.ok
        ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${report.checks.error}`, "failed")]),
    );
}

const response = await fetch("/api/report");
render(await response.json());
