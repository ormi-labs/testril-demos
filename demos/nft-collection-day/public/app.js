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

function hoursChart(hours) {
  const width = 1000;
  const height = 260;
  const pad = { left: 44, right: 12, top: 16, bottom: 28 };
  const peak = Math.max(...hours.map((h) => h.mints + h.trades));
  const slot = (width - pad.left - pad.right) / hours.length;
  const base = height - pad.bottom;
  const scale = (base - pad.top) / peak;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Mints and trades per UTC hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: base,
      y2: base,
      class: "axis",
    }),
    svg("text", { x: pad.left - 8, y: pad.top + 4, class: "tick end" }, peak),
    svg("text", { x: pad.left - 8, y: base, class: "tick end" }, 0),
  );
  for (const { hour, mints, trades } of hours) {
    const x = pad.left + hour * slot + 2;
    const tradeHeight = trades * scale;
    const mintHeight = mints * scale;
    chart.append(
      svg("rect", {
        x,
        y: base - tradeHeight,
        width: slot - 4,
        height: tradeHeight,
        class: "bar trade",
      }),
      svg("rect", {
        x,
        y: base - tradeHeight - mintHeight,
        width: slot - 4,
        height: mintHeight,
        class: "bar mint",
      }),
    );
    if (hour % 3 === 0)
      chart.append(
        svg(
          "text",
          { x, y: height - 8, class: "tick" },
          `${String(hour).padStart(2, "0")}:00`,
        ),
      );
  }
  chart.append(
    svg(
      "text",
      { x: width - pad.right, y: pad.top + 4, class: "series-label end" },
      "trades below, mints above",
    ),
  );
  return chart;
}

function concentrationChart({ top, restFraction, restShare }) {
  const width = 1000;
  const height = 120;
  const pad = 12;
  const barTop = 24;
  const barHeight = 40;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Share of tokens held by the top holders",
  });
  let x = pad;
  const span = width - 2 * pad;
  const segments = [
    ...top.map((holder, i) => ({
      ...holder,
      label: String(i + 1),
      tone: `seg tone${i % 2}`,
    })),
    {
      fraction: restFraction,
      share: restShare,
      label: "rest",
      tone: "seg rest",
    },
  ];
  for (const segment of segments) {
    const w = segment.fraction * span;
    chart.append(
      svg("rect", {
        x,
        y: barTop,
        width: w,
        height: barHeight,
        class: segment.tone,
      }),
    );
    if (w > 30)
      chart.append(
        svg(
          "text",
          { x: x + w / 2, y: barTop + barHeight + 18, class: "tick middle" },
          segment.label,
        ),
      );
    x += w;
  }
  chart.append(
    svg(
      "text",
      { x: pad, y: 16, class: "series-label" },
      "top 10 holders, then everyone else",
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#eyebrow").textContent =
    `ETHEREUM · ${view.name.toUpperCase()} (${view.symbol})`;
  document.querySelector("#day-window").textContent =
    `${view.day} · ${view.dayWindow.from_block}–${view.dayWindow.to_block - 1}`;
  document.querySelector("#owners-window").textContent =
    `blocks ${view.ownersWindow.from_block}–${view.ownersWindow.to_block - 1}`;
  document.querySelector("#collection").textContent = view.collection;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(`MINTED · ${view.day}`, String(view.mints)),
      metric(
        `TRADED · ${view.day}`,
        String(view.trades),
        `${view.burns} burned`,
      ),
      metric("HOLDERS", view.holders, `${view.liveTokens} tokens held`),
      metric(
        "TOP 10 HOLD",
        view.concentration.topShare,
        `rest ${view.concentration.restShare}`,
      ),
    );
  document.querySelector("#hours").replaceChildren(hoursChart(view.hours));
  document.querySelector("#concentration-note").textContent =
    "after the last block of the day";
  document
    .querySelector("#concentration")
    .replaceChildren(concentrationChart(view.concentration));
  document.querySelector("#holders").replaceChildren(
    ...view.concentration.top.map((holder) => {
      const row = element("tr");
      row.append(
        element("td", holder.address),
        element("td", holder.tokens),
        element("td", holder.share),
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
