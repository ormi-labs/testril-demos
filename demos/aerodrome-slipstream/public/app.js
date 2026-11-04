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

function tableRow(...cells) {
  const row = element("tr");
  row.append(...cells.map((text) => element("td", text)));
  return row;
}

function lineChart({ symbol, series }) {
  const width = 520;
  const height = 220;
  const pad = { left: 64, right: 12, top: 16, bottom: 28 };
  const values = series.map((point) => point.millions);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} dollar volume per day`,
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
      `${max.toFixed(0)}M`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      `${min.toFixed(0)}M`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, series[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      series.at(-1).day,
    ),
    svg(
      "text",
      { x: pad.left + 8, y: pad.top + 4, class: "series-label" },
      symbol,
    ),
    svg("polyline", {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  document.querySelector("#factory").textContent = view.factory;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("POOLS TRADED", String(view.poolCount)),
      metric("SWAPS", view.totalSwaps),
      metric("RANKED DOLLAR VOLUME", view.totalDollars),
      view.leader
        ? metric("TOP POOL", view.leader.volume, view.leader.pair)
        : metric("TOP POOL", "—"),
    );
  document
    .querySelector("#chart")
    .replaceChildren(...view.charts.map(lineChart));
  document
    .querySelector("#pools")
    .replaceChildren(
      ...view.rankedPools.map((pool) =>
        tableRow(pool.rank, pool.pool, pool.pair, pool.swaps, pool.volume),
      ),
    );
  document
    .querySelector("#unranked")
    .replaceChildren(
      ...view.unrankedPools.map((pool) => tableRow(pool.pool, pool.swaps)),
    );
  const checks = document.querySelector("#checks");
  checks.replaceChildren(
    ...(report.checks.ok
      ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
      : [element("li", `✗ ${report.checks.error}`, "failed")]),
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
