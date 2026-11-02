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

function sparkline({ label, spark }) {
  const width = 520;
  const height = 140;
  const pad = { left: 12, right: 12, top: 32, bottom: 24 };
  const values = spark.series.map((point) => point.eth);
  const max = Math.max(...values) || 1;
  const x = (i) =>
    pad.left + (i / (values.length - 1)) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / max) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${label} ETH balance by hour`,
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: height - pad.bottom,
      y2: height - pad.bottom,
      class: "axis",
    }),
    svg("text", { x: pad.left, y: 18, class: "series-label" }, label),
    svg(
      "text",
      { x: width - pad.right, y: 18, class: "tick end" },
      `peak ${spark.peak}`,
    ),
    svg(
      "text",
      { x: pad.left, y: height - 6, class: "tick" },
      spark.series[0].hour,
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 6, class: "tick end" },
      spark.series.at(-1).hour,
    ),
    svg("polyline", {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function hopGraph({ nodes, edges }) {
  const width = 1000;
  const boxWidth = 170;
  const boxHeight = 30;
  const rowGap = 46;
  const columns = new Map();
  for (const node of nodes)
    columns.set(node.hop, [...(columns.get(node.hop) ?? []), node]);
  const hops = [...columns.keys()].sort((a, b) => a - b);
  const rows = Math.max(...[...columns.values()].map((c) => c.length));
  const height = 40 + rows * rowGap;
  const position = new Map();
  hops.forEach((hop, column) => {
    const x = 10 + column * ((width - boxWidth - 20) / (hops.length - 1 || 1));
    columns.get(hop).forEach((node, row) => {
      const slack = ((rows - columns.get(hop).length) * rowGap) / 2;
      position.set(node.address, { x, y: 30 + slack + row * rowGap });
    });
  });
  const lane = 5;
  const labelAt = 0.62;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Transfers between wallets, hop by hop",
  });
  hops.forEach((hop) =>
    chart.append(
      svg(
        "text",
        {
          x: position.get(columns.get(hop)[0].address).x,
          y: 16,
          class: "tick",
        },
        columns.get(hop)[0].tracked ? `Hop ${hop}` : "Outside",
      ),
    ),
  );
  for (const edge of edges) {
    const from = position.get(edge.from);
    const to = position.get(edge.to);
    const offset = (edge.tokenIndex - 1) * lane;
    const [x0, y0, x1, y1] = [
      from.x + boxWidth,
      from.y + boxHeight / 2 + offset,
      to.x,
      to.y + boxHeight / 2 + offset,
    ];
    const mid = (x0 + x1) / 2;
    chart.append(
      svg("path", {
        d: `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}`,
        "stroke-width": 1 + edge.share * 5,
        class: `edge token-${edge.tokenIndex}`,
      }),
      svg(
        "text",
        {
          x: x0 + (x1 - x0) * labelAt,
          y: y0 + (y1 - y0) * labelAt + offset * 2.6 - 4,
          class: "tick middle edge-label",
        },
        `${edge.amount} ${edge.symbol}`,
      ),
    );
  }
  for (const node of nodes) {
    const { x, y } = position.get(node.address);
    chart.append(
      svg("rect", {
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        class: node.tracked ? "box" : "box outside",
      }),
      svg("text", { x: x + 8, y: y + 20, class: "node-label" }, node.label),
    );
  }
  return chart;
}

function render(report) {
  const view = report.view;
  banner(report);
  document.querySelector("#transfer-window").textContent =
    `${view.transferWindow.from_block}–${view.transferWindow.to_block - 1}`;
  document.querySelector("#hour-window").textContent =
    `${view.hourWindow.from_hour} to ${view.hourWindow.to_hour} (exclusive)`;
  document.querySelector("#token-list").textContent = view.tokens
    .map((token) => token.symbol)
    .join(" · ");
  const { headline } = view;
  const [first, ...others] = headline.intoExploiter;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        `${first.symbol} INTO THE EXPLOITER`,
        first.amount,
        `plus ${others.map((t) => `${t.amount} ${t.symbol}`).join(" and ")}; native ETH is not in this trail`,
      ),
      metric("TRAIL WALLETS REACHED", headline.reached),
      metric(
        "OUTSIDE DESTINATIONS",
        headline.destinations,
        "not followed further",
      ),
      metric("TRANSFERS COUNTED", headline.transfers, "each once"),
    );
  document.querySelector("#hop-note").textContent =
    `at most 10 wallets; line width is the amount moved, relative within each token; ${view.hiddenEdges} routes under 1,000 not drawn`;
  document.querySelector("#hops").replaceChildren(hopGraph(view));
  document
    .querySelector("#sparklines")
    .replaceChildren(...view.wallets.map(sparkline));
  document.querySelector("#wallets").replaceChildren(
    ...view.wallets.flatMap((wallet) =>
      wallet.tokens.map((token) => {
        const row = element("tr");
        row.append(
          element("td", wallet.label),
          element("td", wallet.address),
          element("td", String(wallet.hop ?? "—")),
          element("td", token.symbol),
          element("td", token.received),
          element("td", token.sent),
          element("td", token.net),
        );
        return row;
      }),
    ),
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
