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

function tableRow(...cells) {
  const row = element("tr");
  row.append(...cells.map((text) => element("td", text)));
  return row;
}

function lineChart({ symbol, series }) {
  const width = 520;
  const height = 220;
  const pad = { left: 64, right: 12, top: 16, bottom: 28 };
  const values = series.map((point) => point.millions);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} dollar volume per day`,
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
      `${max.toFixed(0)}M`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      `${min.toFixed(0)}M`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, series[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      series.at(-1).day,
    ),
    svg(
      "text",
      { x: pad.left + 8, y: pad.top + 4, class: "series-label" },
      symbol,
    ),
    svg("polyline", {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  document.querySelector("#factory").textContent = view.factory;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("POOLS TRADED", String(view.poolCount)),
      metric("SWAPS", view.totalSwaps),
      metric("RANKED DOLLAR VOLUME", view.totalDollars),
      view.leader
        ? metric("TOP POOL", view.leader.volume, view.leader.pair)
        : metric("TOP POOL", "—"),
    );
  document
    .querySelector("#chart")
    .replaceChildren(...view.charts.map(lineChart));
  document
    .querySelector("#pools")
    .replaceChildren(
      ...view.rankedPools.map((pool) =>
        tableRow(pool.rank, pool.pool, pool.pair, pool.swaps, pool.volume),
      ),
    );
  document
    .querySelector("#unranked")
    .replaceChildren(
      ...view.unrankedPools.map((pool) => tableRow(pool.pool, pool.swaps)),
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
