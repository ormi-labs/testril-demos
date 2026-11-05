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

function metric(label, value, note) {
  const node = element("div");
  node.append(element("span", label, "label"), element("strong", value));
  if (note) node.append(element("span", note));
  return node;
}

const dollars = (value) => `$${Math.round(value).toLocaleString("en-US")}`;

function priceChart({ series }) {
  const width = 1000;
  const height = 420;
  const pad = { left: 80, right: 16, top: 56, bottom: 30 };
  const values = series.flatMap((point) => [point.pool, point.oracle]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const line = (key) =>
    series.map((point, i) => `${x(i)},${y(point[key])}`).join(" ");
  const band = [
    ...series.map((point, i) => `${x(i)},${y(point.pool)}`),
    ...series.map((point, i) => `${x(i)},${y(point.oracle)}`).reverse(),
  ].join(" ");
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Uniswap v4 pool price and Chainlink ETH/USD price per hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: height - pad.bottom,
      y2: height - pad.bottom,
      class: "axis",
    }),
    svg("polygon", { points: band, class: "gap-band" }),
    svg("polyline", { points: line("oracle"), class: "line oracle" }),
    svg("polyline", { points: line("pool"), class: "line" }),
    svg(
      "text",
      { x: pad.left - 8, y: y(max) + 4, class: "tick end" },
      dollars(max),
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      dollars(min),
    ),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      series[0].hour.replace("T", " ") + ":00",
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      series.at(-1).hour.replace("T", " ") + ":00",
    ),
    svg(
      "text",
      { x: pad.left + 12, y: pad.top - 40, class: "series-label" },
      "● Uniswap v4 pool",
    ),
    svg(
      "text",
      { x: pad.left + 12, y: pad.top - 18, class: "series-label oracle" },
      "● Chainlink ETH / USD",
    ),
  );
  return chart;
}

function render(report) {
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(report.checks.ok
        ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${report.checks.error}`, "failed")]),
    );
  if (!report.checks.ok) return;
  const view = report.view;
  document.querySelector("#pool-window").textContent =
    `${view.poolWindow.first}:00 to ${view.poolWindow.last}:00 UTC`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("POOL PRICE · LAST HOUR", view.latestPool),
      metric("CHAINLINK · LAST HOUR", view.latestOracle),
      metric("WIDEST GAP", view.widestGap, view.widestGapHour),
      metric("MEAN GAP", view.meanGap, `range ${view.low} to ${view.high}`),
    );
  document.querySelector("#price-chart").replaceChildren(priceChart(view));
  document.querySelector("#feeds").replaceChildren(
    ...view.feeds.map((feed) => {
      const row = element("tr");
      row.append(
        element("td", feed.name),
        element("td", feed.latest),
        element("td", feed.updates),
        element("td", feed.longestFlat),
        element("td", feed.largestStep),
      );
      return row;
    }),
  );
}

const usd = (atoms) => `$${(Number(atoms) / 1e6).toFixed(2)}`;
const count = (n) => Number(n).toLocaleString("en-US");

function bindFraction(bind) {
  const part = bind.total ? bind.done / bind.total : 0;
  if (bind.step === "done") return 1;
  if (bind.step === "indexing") return part / 2;
  if (bind.step === "reading") return 0.5 + part / 2;
  return 0;
}

function bindText(bind) {
  if (bind.step === "indexing" && bind.unit)
    return `indexing ${count(bind.done)} / ${count(bind.total)} ${bind.unit}`;
  if (bind.step === "reading")
    return `${bind.jobId === null ? "already indexed · " : ""}reading ${bind.done} / ${bind.total}`;
  if (bind.step === "done")
    return bind.jobId === null ? "already indexed · read" : "indexed · read";
  return bind.step;
}

function renderBinds(binds) {
  document.querySelector("#fetch-binds").replaceChildren(
    ...binds.map((bind) => {
      const item = element("li");
      const bar = element("progress");
      bar.max = 1;
      bar.value = bindFraction(bind);
      item.append(
        element("span", bind.name, "bind-name"),
        bar,
        element("span", bindText(bind), "bind-step"),
      );
      return item;
    }),
  );
}

function renderRun(run) {
  const button = document.querySelector("#fetch");
  const status = document.querySelector("#fetch-status");
  const overall = document.querySelector("#fetch-overall");
  const list = document.querySelector("#fetch-binds");
  const started = run.binds !== undefined;
  button.disabled = run.state === "unconfigured" || run.state === "running";
  button.textContent =
    run.state === "running"
      ? "Fetching…"
      : run.state === "done"
        ? "Fetch again"
        : run.state === "failed"
          ? "Try again"
          : "Fetch from Testril";
  overall.hidden = list.hidden = !started;
  status.classList.toggle("failed", run.state === "failed");
  if (run.state === "unconfigured")
    status.textContent =
      "Set TESTRIL_PAYER_KEY in the server's environment, then restart it.";
  else if (run.state === "idle")
    status.textContent =
      "Nothing fetched yet. Testril indexes on the first fetch; later fetches only read.";
  if (!started) return;
  const fractions = run.binds.map(bindFraction);
  overall.value = fractions.reduce((a, b) => a + b, 0) / fractions.length;
  renderBinds(run.binds);
  const done = run.binds.filter((bind) => bind.step === "done").length;
  const spent = `${usd(run.spentAtoms)} of usage credits`;
  if (run.state === "running")
    status.textContent = `${done} of ${run.binds.length} binds · ${spent} so far`;
  if (run.state === "failed") status.textContent = run.error;
  if (run.state === "done") {
    status.textContent = `Fetched ${new Date(run.finishedAt).toLocaleString()} · ${spent}`;
    render(run.report);
  }
  document.querySelector("#report").hidden = run.state !== "done";
}

async function poll() {
  let run;
  try {
    run = await (await fetch("/api/run")).json();
  } catch (error) {
    document.querySelector("#fetch-status").textContent =
      `Cannot reach the server (${error.message}). Retrying…`;
    setTimeout(poll, 3000);
    return;
  }
  renderRun(run);
  if (run.state === "running") setTimeout(poll, 1000);
}

document.querySelector("#fetch").addEventListener("click", async () => {
  renderRun(await (await fetch("/api/run", { method: "POST" })).json());
  poll();
});

poll();
