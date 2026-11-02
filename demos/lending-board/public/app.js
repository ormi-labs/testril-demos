const svgNs = "http://www.w3.org/2000/svg";
const venues = [
  ["aave", "Aave v3 deposits"],
  ["markets", "Morpho markets"],
  ["vaults", "Morpho vault balances"],
];

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

function tableRows(rows, columns) {
  return rows.map((row) => {
    const tr = element("tr");
    tr.append(...columns.map((column) => element("td", row[column])));
    return tr;
  });
}

function stackedBars(sleeping) {
  const width = 1000;
  const height = 320;
  const pad = { left: 64, right: 12, top: 16, bottom: 30 };
  const total = (day) => day.aave + day.markets + day.vaults;
  const max = Math.max(...sleeping.map(total));
  const slot = (width - pad.left - pad.right) / sleeping.length;
  const barWidth = slot * 0.6;
  const scale = (height - pad.top - pad.bottom) / max;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "USDC held in Aave, Morpho markets and Morpho vaults per day",
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
      `${(max / 1000).toFixed(1)}B`,
    ),
  );
  sleeping.forEach((day, i) => {
    const x = pad.left + i * slot + (slot - barWidth) / 2;
    let y = height - pad.bottom;
    venues.forEach(([key], venueIndex) => {
      const h = day[key] * scale;
      y -= h;
      chart.append(
        svg("rect", {
          x,
          y,
          width: barWidth,
          height: Math.max(h, 0.5),
          class: `venue venue-${venueIndex}`,
        }),
      );
    });
    chart.append(
      svg(
        "text",
        { x: x + barWidth / 2, y: height - 10, class: "tick middle" },
        day.day.slice(5),
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#state-window").textContent =
    `${view.stateWindow.from_hour} to ${view.stateWindow.to_hour} (exclusive)`;
  document.querySelector("#totals-window").textContent =
    `read at blocks ${view.totalsWindow.from_block}–${view.totalsWindow.to_block - 1}`;
  document.querySelector("#holdings-window").textContent =
    `${view.holdingsWindow.from_day} to ${view.holdingsWindow.to_day} (exclusive)`;
  const { headline } = view;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "USDC UTILIZATION",
        headline.usdcUtilization,
        `${view.reserveCount} reserves listed`,
      ),
      metric("USDC BORROW APR", headline.usdcBorrowApr),
      metric(
        "USDC LIQUIDATED",
        headline.usdcLiquidated,
        "collateral, lifetime",
      ),
      metric("USDC FLASH PREMIUMS", headline.usdcFlashPremium, "lifetime"),
    );
  document
    .querySelector("#board")
    .replaceChildren(
      ...tableRows(view.board, [
        "symbol",
        "supplyApr",
        "borrowApr",
        "utilization",
        "supplied",
        "borrowed",
      ]),
    );
  document
    .querySelector("#totals")
    .replaceChildren(
      ...tableRows(view.totals, [
        "symbol",
        "liquidated",
        "flashLoaned",
        "flashPremium",
      ]),
    );
  document.querySelector("#sleeping-note").textContent =
    "millions of USDC at each day's last sample";
  document
    .querySelector("#sleeping")
    .replaceChildren(stackedBars(view.sleeping));
  document.querySelector("#legend").replaceChildren(
    ...venues.map(([key, name], i) => {
      const item = element("li", `${name} · ${view.sleepingLatest[key]}`);
      item.prepend(element("span", "", `swatch venue-${i}`));
      return item;
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
