const svgNs = "http://www.w3.org/2000/svg";
const width = 1000;
const height = 360;
const pad = { left: 70, right: 12, top: 16, bottom: 28 };

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

const compactAmount = (value) =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(2)}M`
    : value >= 1e3
      ? `${(value / 1e3).toFixed(1)}K`
      : value.toFixed(0);

function frame(label, days, max, plot) {
  const x = (i) =>
    pad.left + (i / (days.length - 1)) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / max) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": label,
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
      compactAmount(max),
    ),
    svg("text", { x: pad.left - 8, y: y(0) + 4, class: "tick end" }, "0"),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, days[0]),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      days.at(-1),
    ),
  );
  chart.append(...plot(x, y));
  return chart;
}

function stackedArea(venues) {
  const days = venues[0].series.map((point) => point.day);
  const totals = days.map((_, i) =>
    venues.reduce((sum, venue) => sum + venue.series[i].amount, 0),
  );
  const max = Math.max(...totals);
  return frame("Staked ETH per day by venue", days, max, (x, y) => {
    const below = days.map(() => 0);
    return venues.map((venue, v) => {
      const top = venue.series.map((point, i) => below[i] + point.amount);
      const edge = (values) => values.map((value, i) => `${x(i)},${y(value)}`);
      const d = [...edge(top), ...edge(below).reverse()].join(" ");
      below.splice(0, below.length, ...top);
      return svg("polygon", { points: d, class: `area area-${v}` });
    });
  });
}

function lineChart({ symbol, series }) {
  const days = series.map((point) => point.day);
  const max = Math.max(...series.map((point) => point.amount));
  return frame(`${symbol} per day`, days, max, (x, y) => [
    svg(
      "text",
      { x: pad.left + 60, y: pad.top + 18, class: "series-label" },
      symbol,
    ),
    svg("polyline", {
      points: series.map((point, i) => `${x(i)},${y(point.amount)}`).join(" "),
      class: "line",
    }),
  ]);
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  const [steth, vaults, wbeth, eigenlayer] = view.venues;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LIDO TOTAL", view.lidoTotal, `on ${view.latestDay}`),
      metric("STVAULTS", vaults.latest, `${vaults.change} over the quarter`),
      metric("WBETH", wbeth.latest, `${wbeth.change} over the quarter`),
      metric(
        "STMATIC",
        view.stmatic.latest,
        `${view.stmatic.change} over the quarter`,
      ),
    );
  document
    .querySelector("#stack")
    .replaceChildren(stackedArea([steth, vaults, wbeth, eigenlayer]));
  document.querySelector("#legend").replaceChildren(
    ...view.venues.map((venue, v) => {
      const item = element("span", venue.symbol);
      item.prepend(element("i", undefined, `area-${v}`));
      return item;
    }),
  );
  document
    .querySelector("#lines")
    .replaceChildren(lineChart(vaults), lineChart(view.stmatic));
  document.querySelector("#venues").replaceChildren(
    ...[...view.venues, view.stmatic].map((venue) => {
      const row = element("tr");
      row.append(
        element("td", venue.symbol),
        element("td", venue.function),
        element("td", venue.first),
        element("td", venue.latest),
        element("td", venue.change),
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

render(await (await fetch("/api/report")).json());
