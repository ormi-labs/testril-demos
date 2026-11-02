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

function barChart(bars) {
  const width = 1000;
  const row = 36;
  const labelWidth = 130;
  const valueWidth = 190;
  const height = bars.length * row + 12;
  const max = Math.max(...bars.map((bar) => bar.amount));
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Taker volume per USDC-quoted market",
  });
  bars.forEach((bar, index) => {
    const y = 8 + index * row;
    const length = (bar.amount / max) * (width - labelWidth - valueWidth);
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 18, class: "node-label end" },
        bar.pair,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: Math.max(length, 1),
        height: 24,
        class: "bar",
      }),
      svg("text", { x: labelWidth + length + 8, y: y + 17 }, bar.volume),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document.querySelector("#router").textContent =
    `${view.router.slice(0, 8)}…${view.router.slice(-6)}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("USDC-QUOTED VOLUME", view.usdcVolume, "taker volume, 8 days"),
      metric("TRADES", view.trades, "all markets"),
      metric(
        "ACTIVE MARKETS",
        `${view.active} of ${view.registered}`,
        "traded in the window",
      ),
      metric(
        "TOP MARKET",
        view.topMarket,
        `${view.topShare} of USDC-quoted volume`,
      ),
    );
  document.querySelector("#volume-chart").replaceChildren(barChart(view.bars));
  document.querySelector("#markets").replaceChildren(
    ...view.markets.map((market) => {
      const row = element("tr");
      row.append(
        element("td", market.pair),
        element(
          "td",
          `${market.market.slice(0, 6)}…${market.market.slice(-4)}`,
        ),
        element("td", market.volume),
        element("td", market.trades),
        element("td", `${market.takerBps} / ${market.makerBps}`),
        element("td", market.fees),
        element("td", market.rebates),
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
