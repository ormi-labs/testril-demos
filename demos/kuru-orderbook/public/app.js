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

function barChart(bars) {
  const width = 1000;
  const row = 36;
  const labelWidth = 130;
  const valueWidth = 190;
  const height = bars.length * row + 12;
  const max = Math.max(0, ...bars.map((bar) => bar.amount)) || 1;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Taker volume per USDC-quoted market",
  });
  bars.forEach((bar, index) => {
    const y = 8 + index * row;
    const length = (bar.amount / max) * (width - labelWidth - valueWidth);
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 18, class: "node-label end" },
        bar.pair,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: Math.max(length, 1),
        height: 24,
        class: "bar",
      }),
      svg("text", { x: labelWidth + length + 8, y: y + 17 }, bar.volume),
    );
  });
  return chart;
}

function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / 86400000;
}

function render(report) {
  const view = report.view;
  const days = daysBetween(
    view.volumeWindow.from_day,
    view.volumeWindow.to_day,
  );
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document.querySelector("#router").textContent =
    `${view.router.slice(0, 8)}…${view.router.slice(-6)}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "USDC-QUOTED VOLUME",
        view.usdcVolume,
        `taker volume, ${days} days`,
      ),
      metric("TRADES", view.trades, "all markets"),
      metric(
        "ACTIVE MARKETS",
        `${view.active} of ${view.registered}`,
        "traded in the window",
      ),
      metric(
        "TOP MARKET",
        view.topMarket,
        `${view.topShare} of USDC-quoted volume`,
      ),
    );
  document.querySelector("#volume-chart").replaceChildren(barChart(view.bars));
  document.querySelector("#markets").replaceChildren(
    ...view.markets.map((market) => {
      const row = element("tr");
      row.append(
        element("td", market.pair),
        element(
          "td",
          `${market.market.slice(0, 6)}…${market.market.slice(-4)}`,
        ),
        element("td", market.volume),
        element("td", market.trades),
        element("td", `${market.takerBps} / ${market.makerBps}`),
        element("td", market.fees),
        element("td", market.rebates),
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
