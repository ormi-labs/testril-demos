const svgNs = "http://www.w3.org/2000/svg";
const labelThreshold = 0.07;

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

const venueClass = (venue) =>
  `venue-${venue.toLowerCase().replace(/\W+/g, "-")}`;

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

function stackedChart(pair) {
  const width = 1000;
  const height = 360;
  const pad = { left: 52, right: 12, top: 16, bottom: 30 };
  const slot = (width - pad.left - pad.right) / pair.days.length;
  const barWidth = slot * 0.7;
  const plotHeight = height - pad.top - pad.bottom;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${pair.title} volume share by venue per day`,
  });
  for (const tick of [0, 0.5, 1])
    chart.append(
      svg(
        "text",
        {
          x: pad.left - 8,
          y: pad.top + (1 - tick) * plotHeight + 4,
          class: "tick end",
        },
        `${tick * 100}%`,
      ),
    );
  pair.days.forEach((day, i) => {
    const x = pad.left + i * slot + (slot - barWidth) / 2;
    let top = pad.top + plotHeight;
    for (const share of day.shares) {
      const h = share.fraction * plotHeight;
      top -= h;
      const title = svg(
        "title",
        {},
        `${day.day} ${share.venue}: ${share.percent} (${share.eth})`,
      );
      const segment = svg("rect", {
        x,
        y: top,
        width: barWidth,
        height: h,
        class: `segment ${venueClass(share.venue)}`,
      });
      segment.append(title);
      chart.append(segment);
      if (share.fraction >= labelThreshold)
        chart.append(
          svg(
            "text",
            { x: x + barWidth / 2, y: top + h / 2 + 4, class: "segment-label" },
            share.percent,
          ),
        );
    }
    chart.append(
      svg(
        "text",
        { x: x + barWidth / 2, y: height - 9, class: "tick middle" },
        day.day.slice(5),
      ),
    );
  });
  return chart;
}

function legend(pair) {
  return pair.overall.map((entry) => {
    const item = element("li");
    item.append(
      element("span", "", `swatch ${venueClass(entry.venue)}`),
      element("span", `${entry.venue} ${entry.percent}`),
      element("span", entry.eth, "muted"),
    );
    return item;
  });
}

function renderPair(pair) {
  document
    .querySelector(`#chart-${pair.id}`)
    .replaceChildren(stackedChart(pair));
  document.querySelector(`#legend-${pair.id}`).replaceChildren(...legend(pair));
}

function render(report) {
  const { view } = report;
  const [ethUsdc, wsteth] = view.pairs;
  const { headline } = view;
  banner(report);
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "ETH/USDC VOLUME",
        headline.volume,
        "selected pools, whole window",
      ),
      metric(
        "LARGEST VENUE",
        headline.leader,
        `${headline.leaderShare} of selected ETH/USDC pools`,
      ),
      metric(
        "LARGEST V3 TIER",
        headline.topTier.tier,
        `${headline.topTier.percent} of v3 ETH/USDC`,
      ),
      metric(
        "FLUID IN WSTETH/ETH (2 POOLS)",
        headline.fluidSteth,
        `${headline.fluidUsdc} of selected ETH/USDC pools`,
      ),
    );
  renderPair(ethUsdc);
  renderPair(wsteth);
  document.querySelector("#tier-note").textContent =
    "ETH/USDC pools of the v3 factory, whole window";
  document.querySelector("#tiers").replaceChildren(
    ...view.tiers.map((tier) => {
      const row = element("tr");
      row.append(
        element("td", tier.tier),
        element("td", tier.pool),
        element("td", tier.eth),
        element("td", tier.percent),
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
