const svgNs = "http://www.w3.org/2000/svg";
const lastHour = 23;

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

function row(cells, leftColumns = []) {
  const node = element("tr");
  cells.forEach((text, index) =>
    node.append(
      element("td", text, leftColumns.includes(index) ? "left" : undefined),
    ),
  );
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

const hourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;

function oddsChart({ market, points }) {
  const width = 1000;
  const height = 300;
  const pad = { left: 56, right: 16, top: 16, bottom: 32 };
  const x = (hour) =>
    pad.left + (hour / lastHour) * (width - pad.left - pad.right);
  const y = (price) => pad.top + (1 - price) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Implied probability of token ${market} per hour`,
  });
  for (const price of [0, 0.5, 1])
    chart.append(
      svg("line", {
        x1: pad.left,
        x2: width - pad.right,
        y1: y(price),
        y2: y(price),
        class: price === 0.5 ? "guide" : "axis",
      }),
      svg("text", { x: pad.left - 8, y: y(price) + 4, class: "end" }, price),
    );
  for (const hour of [0, 6, 12, 18, lastHour])
    chart.append(
      svg(
        "text",
        {
          x: x(hour),
          y: height - 8,
          class: hour === lastHour ? "end" : "",
        },
        hourLabel(hour),
      ),
    );
  chart.append(
    svg("polyline", {
      points: points.map((p) => `${x(p.hour)},${y(p.price)}`).join(" "),
      class: "line",
    }),
    ...points.map((p) =>
      svg("circle", { cx: x(p.hour), cy: y(p.price), r: 3, class: "dot" }),
    ),
  );
  return chart;
}

function shareBar(fraction) {
  const bar = svg("svg", { viewBox: "0 0 100 8", class: "share" });
  bar.append(
    svg("rect", { x: 0, y: 0, width: fraction * 100, height: 8, class: "bar" }),
  );
  return bar;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#day").textContent = view.day;
  document.querySelector("#blocks").textContent =
    `${view.fillWindow.from_block}–${view.fillWindow.to_block - 1}`;
  document.querySelector("#exchanges").textContent = view.exchanges.length;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("FILLS", view.fills),
      metric("VOLUME", view.volume, "collateral moved"),
      metric("LARGEST FILL", view.largest),
      metric("BUILDER CODES", view.builderCount, "non-zero codes seen"),
    );
  document
    .querySelector("#tape")
    .replaceChildren(
      ...view.tape.map((fill) =>
        row(
          [
            hourLabel(fill.hour),
            fill.side,
            fill.maker,
            fill.taker,
            fill.market,
            fill.price,
            fill.tokens,
            fill.volume,
          ],
          [1, 2, 3, 4],
        ),
      ),
    );
  document.querySelector("#odds-note").textContent =
    `token ${view.odds.market}, volume-weighted price of each hour's fills`;
  document.querySelector("#odds").replaceChildren(oddsChart(view.odds));
  document.querySelector("#builders").replaceChildren(
    ...view.builders.map((builder) => {
      const node = row([builder.label, "", builder.fills, builder.volume]);
      const share = node.children[1];
      share.className = "left";
      share.append(shareBar(builder.fraction), ` ${builder.share}`);
      return node;
    }),
  );
  document
    .querySelector("#resolved")
    .replaceChildren(
      ...view.resolved.map((c) =>
        row([c.condition, c.block, c.payouts, c.denominator]),
      ),
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
