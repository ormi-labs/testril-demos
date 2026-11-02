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

function barChart(tokens, count) {
  const top = tokens.slice(0, count);
  const width = 1000;
  const rowHeight = 34;
  const pad = { left: 130, right: 130, top: 34, bottom: 8 };
  const height = pad.top + top.length * rowHeight + pad.bottom;
  const max = Math.max(...top.map((t) => t.buysBnb + t.sellsBnb));
  const scale = (width - pad.left - pad.right) / max;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Buys and sells in BNB for the top tokens",
  });
  chart.append(
    svg("rect", { x: pad.left, y: 12, width: 12, height: 12, class: "buy" }),
    svg("text", { x: pad.left + 18, y: 23, class: "legend-label" }, "Buys"),
    svg("rect", {
      x: pad.left + 80,
      y: 12,
      width: 12,
      height: 12,
      class: "sell",
    }),
    svg("text", { x: pad.left + 98, y: 23, class: "legend-label" }, "Sells"),
  );
  top.forEach((token, i) => {
    const y = pad.top + i * rowHeight;
    const buyWidth = token.buysBnb * scale;
    chart.append(
      svg(
        "text",
        { x: pad.left - 10, y: y + 18, class: "token-label end" },
        token.label,
      ),
      svg("rect", {
        x: pad.left,
        y,
        width: buyWidth,
        height: 22,
        class: "buy",
      }),
      svg("rect", {
        x: pad.left + buyWidth,
        y,
        width: token.sellsBnb * scale,
        height: 22,
        class: "sell",
      }),
      svg(
        "text",
        { x: pad.left + buyWidth + token.sellsBnb * scale + 8, y: y + 17 },
        token.volume,
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document.querySelector("#trades-window").textContent =
    `${view.tradesDay} · blocks ${view.tradesWindow.from_block}–${view.tradesWindow.to_block - 1}`;
  document.querySelector("#portal").textContent = view.portal;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("BOUGHT", view.buys, `across ${view.tokenCount} tokens`),
      metric("SOLD", view.sells),
      metric("TRADES", view.trades),
      metric(`FEES · ${view.tradesDay}`, view.fees),
    );
  document.querySelector("#chart-note").textContent =
    `the ${view.chartTokens} largest by buys plus sells`;
  document
    .querySelector("#chart")
    .replaceChildren(barChart(view.tokens, view.chartTokens));
  document.querySelector("#tokens").replaceChildren(
    ...view.tokens.map((token) => {
      const row = element("tr");
      row.append(
        element("td", token.label),
        element("td", token.trades),
        element("td", token.buys),
        element("td", token.sells),
        element("td", token.buyShare),
      );
      return row;
    }),
  );
  const checks = document.querySelector("#checks");
  checks.replaceChildren(
    ...(report.checks.ok
      ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
      : [element("li", `✗ ${report.checks.error}`, "failed")]),
  );
}

const response = await fetch("/api/report");
render(await response.json());
