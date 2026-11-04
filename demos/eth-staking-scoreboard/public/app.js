const svgNs = "http://www.w3.org/2000/svg";
const width = 520;
const height = 260;
const pad = { left: 62, right: 12, top: 16, bottom: 32 };
const plotHeight = height - pad.top - pad.bottom;

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

const compactAmount = (value) =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(2)}M`
    : value >= 1e3
      ? `${(value / 1e3).toFixed(1)}K`
      : value.toFixed(0);

function lineChart({ symbol, series }) {
  const days = series.map((point) => point.day);
  const amounts = series.map((point) => point.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const x = (i) =>
    pad.left + (i / (days.length - 1)) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - (v - min) / (max - min)) * plotHeight;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} per day`,
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: pad.top + plotHeight,
      y2: pad.top + plotHeight,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 8, y: y(max) + 5, class: "tick end" },
      compactAmount(max),
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 5, class: "tick end" },
      compactAmount(min),
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, days[0]),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      days.at(-1),
    ),
    svg(
      "text",
      {
        x: (pad.left + width - pad.right) / 2,
        y: pad.top + 14,
        class: "series-label middle",
      },
      symbol,
    ),
    svg("polyline", {
      points: series.map((point, i) => `${x(i)},${y(point.amount)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function renderChecks(checks) {
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(checks.ok
        ? checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${checks.error}`, "failed")]),
    );
}

function render(report) {
  const view = report.view;
  renderChecks(report.checks);
  if (!view) return;
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  const [, vaults, wbeth, stmatic] = view.venues;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LIDO TOTAL", view.lidoTotal, `on ${view.latestDay}`),
      metric("STVAULTS", vaults.latest, `${vaults.change} over the quarter`),
      metric("WBETH", wbeth.latest, `${wbeth.change} over the quarter`),
      metric("STMATIC", stmatic.latest, `${stmatic.change} over the quarter`),
    );
  document
    .querySelector("#lines")
    .replaceChildren(...view.venues.map(lineChart));
  document.querySelector("#venues").replaceChildren(
    ...[...view.venues, view.eigenlayer].map((venue) => {
      const row = element("tr");
      row.append(
        element("td", venue.symbol),
        element("td", venue.function),
        element("td", venue.first),
        element("td", venue.latest),
        element("td", venue.change),
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
  const run = await (await fetch("/api/run")).json();
  renderRun(run);
  if (run.state === "running") setTimeout(poll, 1000);
}

document.querySelector("#fetch").addEventListener("click", async () => {
  renderRun(await (await fetch("/api/run", { method: "POST" })).json());
  poll();
});

poll();
