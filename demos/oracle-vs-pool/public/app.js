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

const dollars = (value) => `$${Math.round(value).toLocaleString("en-US")}`;

function priceChart({ series }) {
  const width = 1000;
  const height = 420;
  const pad = { left: 80, right: 16, top: 56, bottom: 30 };
  const values = series.flatMap((point) => [point.pool, point.oracle]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const line = (key) =>
    series.map((point, i) => `${x(i)},${y(point[key])}`).join(" ");
  const band = [
    ...series.map((point, i) => `${x(i)},${y(point.pool)}`),
    ...series.map((point, i) => `${x(i)},${y(point.oracle)}`).reverse(),
  ].join(" ");
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Uniswap v4 pool price and Chainlink ETH/USD price per hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: height - pad.bottom,
      y2: height - pad.bottom,
      class: "axis",
    }),
    svg("polygon", { points: band, class: "gap-band" }),
    svg("polyline", { points: line("oracle"), class: "line oracle" }),
    svg("polyline", { points: line("pool"), class: "line" }),
    svg(
      "text",
      { x: pad.left - 8, y: y(max) + 4, class: "tick end" },
      dollars(max),
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      dollars(min),
    ),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      series[0].hour.replace("T", " ") + ":00",
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      series.at(-1).hour.replace("T", " ") + ":00",
    ),
    svg(
      "text",
      { x: pad.left + 12, y: pad.top + 16, class: "series-label" },
      "● Uniswap v4 pool",
    ),
    svg(
      "text",
      { x: pad.left + 12, y: pad.top + 38, class: "series-label oracle" },
      "● Chainlink ETH / USD",
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#pool-window").textContent =
    `${view.poolWindow.from_hour} to ${view.poolWindow.to_hour} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("POOL PRICE · LAST HOUR", view.latestPool),
      metric("CHAINLINK · LAST HOUR", view.latestOracle),
      metric("WIDEST GAP", view.widestGap, view.widestGapHour),
      metric("MEAN GAP", view.meanGap, `range ${view.low} to ${view.high}`),
    );
  document.querySelector("#price-chart").replaceChildren(priceChart(view));
  document.querySelector("#feeds").replaceChildren(
    ...view.feeds.map((feed) => {
      const row = element("tr");
      row.append(
        element("td", feed.name),
        element("td", feed.latest),
        element("td", feed.updates),
        element("td", feed.longestFlat),
        element("td", feed.largestStep),
      );
      return row;
    }),
  );
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
