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

function lineChart({ symbol, low, high, points }) {
  const width = 1000;
  const height = 240;
  const pad = { left: 120, right: 12, top: 16, bottom: 28 };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} held per day`,
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: height - pad.bottom,
      y2: height - pad.bottom,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 8, y: y(max) + 4, class: "tick end" },
      `${high} ${symbol}`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      `${low} ${symbol}`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, points[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      points.at(-1).day,
    ),
    svg("polyline", {
      points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function holdingsTable(card) {
  const table = element("table");
  const head = element("tr");
  head.append(
    element("th", "Asset"),
    element("th", "Latest"),
    element("th", `Change over ${card.dayCount} days`),
    element("th", "By wallet"),
  );
  const body = element("tbody");
  for (const holding of card.holdings) {
    const row = element("tr");
    row.append(
      element("td", holding.symbol),
      element("td", holding.latest),
      element("td", holding.change),
      element(
        "td",
        holding.wallets.map((w) => `${w.label} ${w.amount}`).join(" · "),
      ),
    );
    body.append(row);
  }
  const header = element("thead");
  header.append(head);
  table.append(header, body);
  return table;
}

function cardNode(card) {
  const section = element("section", undefined, "results");
  const heading = element("div", undefined, "section-heading");
  heading.append(
    element("h2", card.name),
    element("span", `${card.chain} · ${card.window}`),
  );
  const chart = element("div", undefined, "chart");
  chart.append(lineChart(card.line));
  const table = element("div", undefined, "table-wrap");
  table.append(holdingsTable(card));
  section.append(heading, chart, table);
  return section;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#scope").replaceChildren(
    ...view.scope.map(({ label, value }) => {
      const node = element("div");
      node.append(element("span", label, "label"), element("strong", value));
      return node;
    }),
  );
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.headline.map(({ label, value, note }) =>
        metric(label, value, note),
      ),
    );
  document.querySelector("#cards").replaceChildren(...view.cards.map(cardNode));
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
