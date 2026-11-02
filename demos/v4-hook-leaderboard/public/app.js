const svgNs = "http://www.w3.org/2000/svg";
const kinds = { Arrakis: "arrakis", "No hook": "none", Unlabelled: "" };

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

function barChart(hooks, count) {
  const shown = hooks.slice(0, count);
  const width = 1000;
  const rowHeight = 34;
  const [labelWidth, valueWidth] = [220, 110];
  const max = Math.max(...shown.map((hook) => hook.swapCount));
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${shown.length * rowHeight + 10}`,
    role: "img",
    "aria-label": "Swaps per hook",
  });
  shown.forEach((hook, index) => {
    const y = 10 + index * rowHeight;
    const length =
      (hook.swapCount / max) * (width - labelWidth - valueWidth - 20);
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 15, class: "bar-label end" },
        `${hook.label} ${hook.address}`.replace(/ —$/, ""),
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: Math.max(length, 1),
        height: rowHeight - 12,
        class: `bar ${kinds[hook.label]}`,
      }),
      svg(
        "text",
        { x: labelWidth + length + 8, y: y + 15, class: "tick" },
        hook.swaps,
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#pools-window").textContent =
    `${view.poolsWindow.from_block}–${view.poolsWindow.to_block - 1}`;
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("SWAPS", view.totalSwaps, `${view.totalVolume} stablecoin volume`),
      metric("SWAPS THROUGH HOOKS", view.hookedShare, "of all swaps"),
      metric("HOOKS WITH SWAPS", view.hookCount, "excluding no hook"),
      metric("ARRAKIS HOOKS", view.arrakisCount, `${view.arrakisSwaps} swaps`),
    );
  document
    .querySelector("#chart")
    .replaceChildren(barChart(view.hooks, view.chartedHooks));
  document.querySelector("#hooks").replaceChildren(
    ...view.hooks.map((hook) => {
      const row = element("tr");
      row.append(
        element("td", hook.address),
        element("td", hook.label),
        element("td", hook.pools),
        element("td", hook.swaps),
        element("td", hook.volume),
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
