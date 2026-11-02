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

function timelineChart(timeline) {
  const width = 1000;
  const pad = { left: 70, right: 16 };
  const price = { top: 16, bottom: 210 };
  const burns = { top: 250, bottom: 420 };
  const x = (i) =>
    pad.left + (i / (timeline.length - 1)) * (width - pad.left - pad.right);
  const prices = timeline.map((point) => point.priceValue);
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const priceY = (v) =>
    price.bottom - ((v - low) / (high - low || 1)) * (price.bottom - price.top);
  const bars = timeline.map((point) => point.netBurnMillions);
  const reach = Math.max(...bars.map(Math.abs)) || 1;
  const zero = (burns.top + burns.bottom) / 2;
  const barY = (v) => zero - (v / reach) * ((burns.bottom - burns.top) / 2);
  const barWidth = Math.max(
    (width - pad.left - pad.right) / timeline.length - 1,
    1,
  );
  const chart = svg("svg", {
    viewBox: `0 0 ${width} 440`,
    role: "img",
    "aria-label": "Chainlink USDC/USD answer and net USDC burns per hour",
  });
  chart.append(
    svg(
      "text",
      { x: pad.left, y: price.top - 4, class: "series-label" },
      "Chainlink USDC/USD",
    ),
    svg(
      "text",
      { x: pad.left - 8, y: priceY(high) + 4, class: "tick end" },
      `$${high.toFixed(3)}`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: priceY(low) + 4, class: "tick end" },
      `$${low.toFixed(3)}`,
    ),
    svg("polyline", {
      points: prices.map((v, i) => `${x(i)},${priceY(v)}`).join(" "),
      class: "line",
    }),
    svg(
      "text",
      { x: pad.left, y: burns.top - 8, class: "series-label" },
      "Net burn per hour (burned − minted)",
    ),
    svg(
      "text",
      { x: pad.left - 8, y: barY(reach) + 4, class: "tick end" },
      `+${reach.toFixed(0)}M`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: barY(-reach) + 4, class: "tick end" },
      `−${reach.toFixed(0)}M`,
    ),
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: zero,
      y2: zero,
      class: "axis",
    }),
  );
  timeline.forEach((point, i) => {
    const y = barY(point.netBurnMillions);
    chart.append(
      svg("rect", {
        x: x(i) - barWidth / 2,
        y: Math.min(y, zero),
        width: barWidth,
        height: Math.max(Math.abs(y - zero), 0.5),
        class: point.netBurnMillions >= 0 ? "burn" : "mint",
      }),
    );
  });
  chart.append(
    svg("text", { x: pad.left, y: 436, class: "tick" }, timeline[0].label),
    svg(
      "text",
      { x: width - pad.right, y: 436, class: "tick end" },
      timeline.at(-1).label,
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#hour-window").textContent =
    `${view.hourWindow.from_hour} to ${view.hourWindow.to_hour} (exclusive)`;
  document.querySelector("#edges-window").textContent =
    `blocks ${view.edgesWindow.from_block}–${view.edgesWindow.to_block - 1}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LOWEST ANSWER", view.lowest.price, view.lowest.hour),
      metric("PEAK NET BURN", view.peakBurn.amount, view.peakBurn.hour),
      metric("USDC BURNED", view.burned),
      metric("USDC MINTED", view.minted, `net burn ${view.net}`),
    );
  document
    .querySelector("#timeline")
    .replaceChildren(timelineChart(view.timeline));
  document.querySelector("#redeemers").replaceChildren(
    ...view.redeemers.map((redeemer) => {
      const row = element("tr");
      row.append(
        element("td", redeemer.label),
        element("td", redeemer.redemptions),
        element("td", redeemer.share),
        element("td", redeemer.amount),
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
