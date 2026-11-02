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

function histogram({ bars, marker }) {
  const width = 1000;
  const height = 340;
  const pad = { left: 16, right: 16, top: 28, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / bars.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label":
      "In-range liquidity at each price, with the current price marked",
  });
  bars.forEach((bar, i) => {
    const barHeight = Math.max(bar.height * plotHeight, 1);
    const node = svg("rect", {
      x: pad.left + i * step + 1,
      y: pad.top + plotHeight - barHeight,
      width: step - 2,
      height: barHeight,
      class: "bar",
    });
    node.append(svg("title", {}, `${bar.price} · ${bar.liquidity} liquidity`));
    chart.append(node);
  });
  const markerX = pad.left + marker * plotWidth;
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: pad.top + plotHeight,
      y2: pad.top + plotHeight,
      class: "axis",
    }),
    svg("line", {
      x1: markerX,
      x2: markerX,
      y1: pad.top - 8,
      y2: pad.top + plotHeight,
      class: "marker",
    }),
    svg(
      "text",
      { x: markerX + 6, y: pad.top + 2, class: "marker-label" },
      "current price",
    ),
    svg("text", { x: pad.left, y: height - 10, class: "tick" }, bars[0].price),
    svg(
      "text",
      { x: width - pad.right, y: height - 10, class: "tick end" },
      bars.at(-1).price,
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#pool-id").textContent =
    `${view.pool.pair} ${view.pool.fee} · ${view.pool.id.slice(0, 10)}…`;
  document.querySelector("#tick-window").textContent =
    `${view.tickWindow.from_block}–${view.tickWindow.to_block - 1}`;
  document.querySelector("#state-day").textContent =
    `${view.stateDay}, end of day`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("PRICE · USDC PER ETH", view.price),
      metric("CURRENT TICK", view.currentTick),
      metric("IN-RANGE LIQUIDITY", view.liquidity),
      metric("INITIALIZED TICKS", view.initializedTicks),
    );
  document.querySelector("#histogram-note").textContent =
    `${view.bars.length} buckets of 100 ticks (about 1% each) around the current price`;
  document.querySelector("#histogram").replaceChildren(histogram(view));
  document.querySelector("#ticks").replaceChildren(
    ...view.ticks.map((tick) => {
      const row = element("tr");
      row.append(
        element("td", tick.tick),
        element("td", tick.price),
        element("td", tick.side),
        element("td", tick.gross),
        element("td", tick.net),
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
