const svgNs = "http://www.w3.org/2000/svg";
const barMarkets = 10;

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

function barChart(markets) {
  const rowHeight = 32;
  const width = 1000;
  const labelWidth = 130;
  const valueWidth = 170;
  const height = markets.length * rowHeight + 10;
  const largest = Math.max(...markets.map((market) => market.cents));
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Trade volume of the busiest markets",
  });
  markets.forEach((market, index) => {
    const y = 5 + index * rowHeight;
    const barWidth = Math.max(
      (market.cents / largest) * (width - labelWidth - valueWidth),
      1,
    );
    chart.append(
      svg(
        "text",
        { x: labelWidth - 8, y: y + 17, class: "node-label end" },
        market.market,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: barWidth,
        height: 22,
        class: "bar",
      }),
      svg(
        "text",
        { x: labelWidth + barWidth + 8, y: y + 17, class: "node-label" },
        market.volume,
      ),
    );
  });
  return chart;
}

function fillTable(selector, rows, fields) {
  document.querySelector(selector).replaceChildren(
    ...rows.map((row) => {
      const node = element("tr");
      node.append(...fields.map((field) => element("td", row[field])));
      return node;
    }),
  );
}

function render(report) {
  const view = report.view;
  document.querySelector("#window").textContent =
    `${view.window.first} to ${view.window.last}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("MARKETS CREATED", view.marketCount),
      metric("TRADES", view.tradeCount),
      metric("TRADE VOLUME", view.volume),
      metric(
        "MARKETS ON OTHER COLLATERAL",
        String(
          view.otherCollateral.reduce(
            (sum, token) => sum + Number(token.markets),
            0,
          ),
        ),
      ),
      metric("QUESTIONS ANSWERED", view.answeredCount),
    );
  document
    .querySelector("#volume")
    .replaceChildren(barChart(view.markets.slice(0, barMarkets)));
  fillTable("#markets", view.markets, [
    "market",
    "creator",
    "trades",
    "volume",
  ]);
  fillTable("#answers", view.answers, [
    "question",
    "answer",
    "bond",
    "finalizes",
  ]);
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
