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

function funnelChart(steps) {
  const width = 1000;
  const rowHeight = 56;
  const labelWidth = 130;
  const max = Math.max(...steps.map((step) => step.count), 1);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${steps.length * rowHeight + 10}`,
    role: "img",
    "aria-label": "Tokens launched, graduated and with fees swept",
  });
  steps.forEach((step, i) => {
    const y = 10 + i * rowHeight;
    const barWidth = ((width - labelWidth - 80) * step.count) / max;
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 24, class: "bar-label end" },
        step.label,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: barWidth,
        height: 36,
        class: i === 2 ? "bar sweep" : "bar",
      }),
      svg(
        "text",
        { x: labelWidth + barWidth + 10, y: y + 24, class: "bar-label" },
        String(step.count),
      ),
    );
  });
  return chart;
}

function dailyChart(daily) {
  const width = 1000;
  const height = 240;
  const pad = { left: 70, right: 12, top: 16, bottom: 28 };
  const max = Math.max(...daily.map((d) => d.eth), 1e-9);
  const slot = (width - pad.left - pad.right) / daily.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "ETH of fees swept per day",
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
      { x: pad.left - 8, y: pad.top + 4, class: "tick end" },
      `${max.toFixed(2)} ETH`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, daily[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      daily.at(-1).day,
    ),
  );
  daily.forEach((d, i) => {
    const h = (d.eth / max) * (height - pad.top - pad.bottom);
    chart.append(
      svg("rect", {
        x: pad.left + i * slot + 2,
        y: height - pad.bottom - h,
        width: slot - 4,
        height: h,
        class: "bar sweep",
      }),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#launch-window").textContent =
    `${view.launchWindow.from_block}–${view.launchWindow.to_block - 1}`;
  document.querySelector("#fees-window").textContent =
    `${view.feesWindow.from_day} to ${view.feesWindow.to_day} (exclusive)`;
  const [launched, graduated] = view.funnel;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LAUNCHED", String(launched.count), "tokens on bonding curves"),
      metric(
        "GRADUATED",
        String(graduated.count),
        `${view.graduationRate} of launches`,
      ),
      metric("FEES SWEPT", view.swept, `curve volume ${view.volume}`),
      metric(
        "SPLIT",
        `${view.creatorShare} / ${view.buybackShare} / ${view.protocolShare}`,
        "creator / buyback / protocol",
      ),
    );
  document.querySelector("#funnel").replaceChildren(funnelChart(view.funnel));
  document.querySelector("#daily").replaceChildren(dailyChart(view.daily));
  document.querySelector("#tokens").replaceChildren(
    ...view.tokens.map((token) => {
      const row = element("tr");
      row.append(
        element("td", token.label),
        element("td", token.sweeps),
        element("td", token.creator),
        element("td", token.buyback),
        element("td", token.protocol),
        element("td", token.total),
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
