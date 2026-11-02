const svgNs = "http://www.w3.org/2000/svg";
const width = 1000;
const gutter = { left: 150, right: 16, top: 12 };
const basisPointsPerWhole = 10000;
const rowHeight = 22;
const barRowHeight = 52;
const laneGap = 28;
const axisHeight = 30;
const rowOrder = ["renewal", "owner", "resolver", "address", "wrapper"];
const rowNames = {
  renewal: "Registration / renewal",
  owner: "Owner",
  resolver: "Resolver",
  address: "Address record",
  wrapper: "NameWrapper",
};

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
  node.append(element("span", note));
  return node;
}

const monthIndex = (month) => {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
};

function yearTicks({ from_month: from, to_month: to }) {
  const first = monthIndex(from);
  const months = monthIndex(to) - first;
  const ticks = [];
  for (let m = first; m < first + months; m++)
    if (m % 12 === 0) ticks.push({ year: m / 12, share: (m - first) / months });
  return ticks;
}

function laneRows() {
  let y = 0;
  return rowOrder.map((kind) => {
    const height = kind === "renewal" ? barRowHeight : rowHeight;
    const row = { kind, y, height };
    y += height;
    return row;
  });
}

function mark(row, point, x, top) {
  const base = top + row.y + row.height;
  if (row.kind === "renewal") {
    const barHeight = Math.max(
      (point.costBasisPoints / basisPointsPerWhole) * (row.height - 6),
      3,
    );
    return svg("rect", {
      x: x - 3,
      y: base - barHeight - 2,
      width: 6,
      height: barHeight,
      class: `mark ${point.kind}`,
    });
  }
  return svg("circle", {
    cx: x,
    cy: base - row.height / 2,
    r: 5,
    class: `mark ${point.kind}`,
  });
}

function timelineChart(view) {
  const plotWidth = width - gutter.left - gutter.right;
  const x = (share) => gutter.left + share * plotWidth;
  const rows = laneRows();
  const laneHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const height =
    gutter.top + view.subjects.length * (laneHeight + laneGap) + axisHeight;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Ownership, resolver, address and renewal events per name",
  });
  view.subjects.forEach((subject, lane) => {
    const top = gutter.top + lane * (laneHeight + laneGap);
    chart.append(
      svg("text", { x: 0, y: top + 12, class: "series-label" }, subject.name),
    );
    for (const row of rows) {
      const y = top + row.y + row.height;
      chart.append(
        svg("line", {
          x1: gutter.left,
          x2: width - gutter.right,
          y1: y,
          y2: y,
          class: "axis",
        }),
        svg(
          "text",
          { x: gutter.left - 8, y: y - row.height / 2 + 4, class: "tick end" },
          rowNames[row.kind],
        ),
      );
    }
    for (const point of subject.marks) {
      const row = rows.find(
        (r) =>
          r.kind === (point.kind === "registration" ? "renewal" : point.kind),
      );
      chart.append(mark(row, point, x(point.position), top));
    }
  });
  const axisY = height - axisHeight + 18;
  for (const { year, share } of yearTicks(view.monthWindow))
    chart.append(svg("text", { x: x(share), y: axisY, class: "tick" }, year));
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#block-window").textContent =
    `${view.blockWindow.from_block} to ${view.blockWindow.to_block} (exclusive)`;
  document.querySelector("#month-window").textContent =
    `${view.monthWindow.from_month} to ${view.monthWindow.to_month} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.subjects.flatMap((subject) => [
        metric(
          `${subject.name.toUpperCase()} RENEWALS`,
          subject.renewals,
          `${subject.renewalCost} · paid until ${subject.expires}`,
        ),
        metric(
          `${subject.name.toUpperCase()} OWNER CHANGES`,
          subject.ownerChanges,
          `now ${subject.owner} · ${subject.addressChanges} address changes`,
        ),
      ]),
    );
  document
    .querySelector("#timeline-chart")
    .replaceChildren(timelineChart(view));
  document.querySelector("#timeline-note").textContent =
    `${view.timeline.length} events across both names`;
  document.querySelector("#events").replaceChildren(
    ...view.timeline.map((event) => {
      const row = element("tr");
      row.append(
        element("td", event.subject),
        element("td", event.when),
        element("td", event.kind),
        element("td", event.text),
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
