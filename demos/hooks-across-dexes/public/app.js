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

function splitChart(venues) {
  const width = 1000;
  const rowHeight = 64;
  const [labelWidth, right] = [250, 80];
  const barHeight = 28;
  const height = venues.length * rowHeight + 20;
  const widest = Math.max(
    ...venues.map((v) => v.hookedMillions + v.hooklessMillions),
  );
  const scale = (width - labelWidth - right) / widest;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Hooked and hookless volume per venue",
  });
  venues.forEach((venue, index) => {
    const y = 10 + index * rowHeight + (rowHeight - barHeight) / 2;
    const hookedWidth = venue.hookedMillions * scale;
    chart.append(
      svg(
        "text",
        { x: labelWidth - 12, y: y + 18, class: "node-label end" },
        venue.name,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: venue.hooklessMillions * scale,
        height: barHeight,
        class: "bar hookless",
      }),
      svg("rect", {
        x: labelWidth + venue.hooklessMillions * scale,
        y,
        width: hookedWidth,
        height: barHeight,
        class: "bar hooked",
      }),
      svg(
        "text",
        {
          x:
            labelWidth +
            (venue.hooklessMillions + venue.hookedMillions) * scale +
            8,
          y: y + 18,
          class: "node-label",
        },
        venue.hookedShare,
      ),
    );
  });
  return chart;
}

function legend() {
  const node = element("p", undefined, "legend");
  node.append(
    element("span", "Hookless", "swatch hookless"),
    element(
      "span",
      "Hooked (share printed at the end of each bar)",
      "swatch hooked",
    ),
  );
  return node;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#day-window").textContent =
    `${view.dayWindow.from_day} to ${view.dayWindow.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.dexes.map((dex) =>
        metric(
          `${dex.dex.toUpperCase()} HOOKED`,
          dex.hookedShare,
          `${dex.hooked} of ${dex.total}`,
        ),
      ),
      ...view.dexes.map((dex) =>
        metric(
          `${dex.dex.toUpperCase()} HOOK POOLS`,
          String(dex.activeHookedPools),
          `of ${dex.activePools} pools that traded`,
        ),
      ),
    );
  document
    .querySelector("#split")
    .replaceChildren(splitChart(view.venues), legend());
  document.querySelector("#pools").replaceChildren(
    ...view.hookedPools.map((pool) => {
      const row = element("tr");
      row.append(
        element("td", pool.venue),
        element("td", pool.pair),
        element("td", pool.pool),
        element("td", pool.hooks),
        element("td", pool.swaps),
        element("td", pool.stable),
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
