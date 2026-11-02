const svgNs = "http://www.w3.org/2000/svg";
const palette = 6;

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

function stackedArea({ exchanges, hours }) {
  const width = 1000;
  const height = 380;
  const pad = { left: 64, right: 12, top: 16, bottom: 28 };
  const totals = hours.map((_, i) =>
    exchanges.reduce((sum, exchange) => sum + exchange.millions[i], 0),
  );
  const max = Math.max(...totals);
  const x = (i) =>
    pad.left + (i / (hours.length - 1)) * (width - pad.left - pad.right);
  const y = (millions) =>
    pad.top + (1 - millions / max) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Stablecoins held per exchange, stacked, per hour",
  });
  const floor = hours.map(() => 0);
  exchanges.forEach((exchange, index) => {
    const top = floor.map((base, i) => base + exchange.millions[i]);
    const upper = top.map((v, i) => `${x(i)},${y(v)}`);
    const lower = floor.map((v, i) => `${x(i)},${y(v)}`).reverse();
    chart.append(
      svg("polygon", {
        points: [...upper, ...lower].join(" "),
        class: `area area-${index % palette}`,
      }),
    );
    top.forEach((v, i) => (floor[i] = v));
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
      `${(max / 1000).toFixed(2)}B`,
    ),
    svg("text", { x: pad.left - 8, y: y(0) + 4, class: "tick end" }, "0"),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, hours[0]),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      hours.at(-1),
    ),
  );
  return chart;
}

function legend(exchanges) {
  return exchanges.map((exchange, index) => {
    const item = element("li");
    item.append(
      element("span", "", `swatch area-${index % palette}`),
      element("strong", exchange.name),
      element("span", `${exchange.latest} · ${exchange.eth}`),
    );
    return item;
  });
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.tideWindow.from_hour} to ${view.tideWindow.to_hour} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "STABLECOINS HELD",
        view.stablecoins,
        `${view.stablecoinChange} over the week`,
      ),
      metric("ETH HELD", view.eth, "across all listed wallets"),
      metric("BIGGEST HOUR IN", view.biggestIn.amount, view.biggestIn.where),
      metric("BIGGEST HOUR OUT", view.biggestOut.amount, view.biggestOut.where),
    );
  document.querySelector("#tide").replaceChildren(stackedArea(view));
  document.querySelector("#legend").replaceChildren(...legend(view.exchanges));
  document.querySelector("#biggest").replaceChildren(
    ...view.biggestHours.map((hour) => {
      const row = element("tr");
      row.append(
        element("td", hour.hour),
        element("td", hour.exchange),
        element("td", hour.direction),
        element("td", hour.change),
        element("td", hour.balance),
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
