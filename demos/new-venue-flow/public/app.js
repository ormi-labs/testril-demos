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

function barChart({ symbol, bars }) {
  const width = 520;
  const height = 220;
  const pad = { left: 12, right: 12, top: 28, bottom: 28 };
  const max = Math.max(...bars.map((bar) => bar.value));
  const slot = (width - pad.left - pad.right) / bars.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} volume per day`,
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
      { x: pad.left + 4, y: pad.top - 10, class: "series-label" },
      symbol,
    ),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      bars[0].day.slice(5),
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      bars.at(-1).day.slice(5),
    ),
  );
  bars.forEach((bar, i) => {
    const h = max ? (bar.value / max) * (height - pad.top - pad.bottom) : 0;
    const rect = svg("rect", {
      x: pad.left + i * slot + slot * 0.15,
      y: height - pad.bottom - h,
      width: slot * 0.7,
      height: h,
      class: "bar",
    });
    rect.append(svg("title", {}, `${bar.day}: ${bar.label} (${bar.count})`));
    chart.append(rect);
  });
  return chart;
}

function venueSection(venue) {
  const section = element("section", undefined, "results");
  const heading = element("div", undefined, "section-heading");
  heading.append(
    element("h2", venue.title),
    element("span", `${venue.functionSlug} · each token on its own scale`),
  );
  const charts = element("div", undefined, "charts");
  charts.append(...venue.tokens.map(barChart));
  section.append(heading, charts);
  return section;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.venues.map((venue) =>
        metric(
          venue.title.toUpperCase(),
          venue.count,
          `${venue.unit} across ${venue.tokens.length} tokens`,
        ),
      ),
    );
  document
    .querySelector("#venues")
    .replaceChildren(...view.venues.map(venueSection));
  document.querySelector("#venue-table").replaceChildren(
    ...view.venues.flatMap((venue) =>
      venue.tokens.map((token) => {
        const row = element("tr");
        row.append(
          element("td", venue.title),
          element("td", token.symbol),
          element("td", token.count),
          element("td", token.total),
        );
        return row;
      }),
    ),
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
