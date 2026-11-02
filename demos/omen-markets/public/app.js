const svgNs = "http://www.w3.org/2000/svg";
const barMarkets = 10;

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

function barChart(markets) {
  const rowHeight = 32;
  const width = 1000;
  const labelWidth = 130;
  const valueWidth = 170;
  const height = markets.length * rowHeight + 10;
  const largest = Math.max(...markets.map((market) => market.wxdai));
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Trade volume of the busiest markets",
  });
  markets.forEach((market, index) => {
    const y = 5 + index * rowHeight;
    const barWidth = Math.max(
      (market.wxdai / largest) * (width - labelWidth - valueWidth),
      1,
    );
    chart.append(
      svg(
        "text",
        { x: labelWidth - 8, y: y + 17, class: "node-label end" },
        market.market,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: barWidth,
        height: 22,
        class: "bar",
      }),
      svg(
        "text",
        { x: labelWidth + barWidth + 8, y: y + 17, class: "node-label" },
        market.volume,
      ),
    );
  });
  return chart;
}

function fillTable(selector, rows, fields) {
  document.querySelector(selector).replaceChildren(
    ...rows.map((row) => {
      const node = element("tr");
      node.append(...fields.map((field) => element("td", row[field])));
      return node;
    }),
  );
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_block}–${view.window.to_block - 1}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("MARKETS CREATED", view.marketCount),
      metric("TRADES", view.tradeCount),
      metric("TRADE VOLUME", view.volume),
      metric("QUESTIONS ANSWERED", view.answeredCount),
    );
  document
    .querySelector("#volume")
    .replaceChildren(barChart(view.markets.slice(0, barMarkets)));
  fillTable("#markets", view.markets, [
    "market",
    "creator",
    "trades",
    "volume",
  ]);
  fillTable("#answers", view.answers, [
    "question",
    "answer",
    "bond",
    "finalizes",
  ]);
  const checks = document.querySelector("#checks");
  checks.replaceChildren(
    ...(report.checks.ok
      ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
      : [element("li", `✗ ${report.checks.error}`, "failed")]),
  );
}

const response = await fetch("/api/report");
render(await response.json());
