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

function hourlyChart(hours) {
  const width = 1000;
  const height = 260;
  const pad = { left: 40, right: 12, top: 20, bottom: 28 };
  const max = Math.max(...hours.map((h) => h.swaps));
  const slot = (width - pad.left - pad.right) / hours.length;
  const base = height - pad.bottom;
  const barHeight = (swaps) => (swaps / max) * (base - pad.top);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Swaps per UTC hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: base,
      y2: base,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 6, y: pad.top + 4, class: "tick end" },
      String(max),
    ),
  );
  hours.forEach((hour, i) => {
    const x = pad.left + i * slot;
    const top = base - barHeight(hour.swaps);
    chart.append(
      svg("rect", {
        x: x + 3,
        y: top,
        width: slot - 6,
        height: barHeight(hour.swaps),
        class: "bar",
      }),
      svg(
        "text",
        { x: x + slot / 2, y: height - 8, class: "tick middle" },
        hour.hour,
      ),
    );
    if (hour.jit)
      chart.append(
        svg("circle", {
          cx: x + slot / 2 - 5,
          cy: top - 8,
          r: 4,
          class: "mark-jit",
        }),
      );
    if (hour.sandwiches)
      chart.append(
        svg("circle", {
          cx: x + slot / 2 + 5,
          cy: top - 8,
          r: 4,
          class: "mark-sandwich",
        }),
      );
  });
  return chart;
}

function link(tx) {
  const anchor = element("a", tx.hash);
  anchor.href = tx.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function row(...cells) {
  const tr = element("tr");
  for (const cell of cells) {
    const td = element("td");
    td.append(cell);
    tr.append(td);
  }
  return tr;
}

function fillTable(id, items, cells) {
  document
    .querySelector(id)
    .replaceChildren(
      ...(items.length
        ? items.map((item) => row(...cells(item)))
        : [row("None found in this window")]),
    );
}

function setupTabs() {
  const tabs = [...document.querySelectorAll("[role=tab]")];
  const select = (selected) =>
    tabs.forEach((tab) => {
      const on = tab === selected;
      tab.setAttribute("aria-selected", String(on));
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    });
  tabs.forEach((tab) => tab.addEventListener("click", () => select(tab)));
  select(tabs[0]);
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#day").textContent = view.day;
  document.querySelector("#blocks").textContent =
    `${view.blockWindow.from_block}–${view.blockWindow.to_block - 1}`;
  document.querySelector("#tokens").textContent = view.tokens
    .map((t) => t.symbol)
    .join(" · ");
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("SWAPS", view.counts.swaps),
      metric("LIQUIDITY CHANGES", view.counts.liquidity),
      metric("JIT EVENTS", view.counts.jit),
      metric("SANDWICHES", view.counts.sandwiches),
    );
  document.querySelector("#hourly").replaceChildren(hourlyChart(view.hourly));
  fillTable("#biggest", view.biggest, (s) => [
    s.rank,
    s.pool,
    s.direction,
    s.sender,
    s.block,
    s.size,
    link(s.tx),
  ]);
  fillTable("#jit", view.jit, (j) => [
    j.block,
    j.pool,
    j.sender,
    j.ticks,
    j.liquidity,
    link(j.add),
    link(j.swap),
    link(j.remove),
  ]);
  fillTable("#sandwiches", view.sandwiches, (s) => [
    s.block,
    s.pool,
    s.attacker,
    s.victim,
    s.direction,
    link(s.front),
    link(s.victimTx),
    link(s.back),
  ]);
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(report.checks.ok
        ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${report.checks.error}`, "failed")]),
    );
}

setupTabs();
const response = await fetch("/api/report");
render(await response.json());
