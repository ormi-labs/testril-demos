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

function barChart(tokens, count) {
  const top = tokens.slice(0, count);
  const width = 1000;
  const rowHeight = 34;
  const pad = { left: 130, right: 130, top: 34, bottom: 8 };
  const height = pad.top + top.length * rowHeight + pad.bottom;
  const max = Math.max(...top.map((t) => t.buysBnb + t.sellsBnb));
  const scale = (width - pad.left - pad.right) / max;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Buys and sells in BNB for the top tokens",
  });
  chart.append(
    svg("rect", { x: pad.left, y: 12, width: 12, height: 12, class: "buy" }),
    svg("text", { x: pad.left + 18, y: 23, class: "legend-label" }, "Buys"),
    svg("rect", {
      x: pad.left + 80,
      y: 12,
      width: 12,
      height: 12,
      class: "sell",
    }),
    svg("text", { x: pad.left + 98, y: 23, class: "legend-label" }, "Sells"),
  );
  top.forEach((token, i) => {
    const y = pad.top + i * rowHeight;
    const buyWidth = token.buysBnb * scale;
    chart.append(
      svg(
        "text",
        { x: pad.left - 10, y: y + 18, class: "token-label end" },
        token.label,
      ),
      svg("rect", {
        x: pad.left,
        y,
        width: buyWidth,
        height: 22,
        class: "buy",
      }),
      svg("rect", {
        x: pad.left + buyWidth,
        y,
        width: token.sellsBnb * scale,
        height: 22,
        class: "sell",
      }),
      svg(
        "text",
        { x: pad.left + buyWidth + token.sellsBnb * scale + 8, y: y + 17 },
        token.volume,
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document.querySelector("#trades-window").textContent =
    `${view.tradesDay} · blocks ${view.tradesWindow.from_block}–${view.tradesWindow.to_block - 1}`;
  document.querySelector("#portal").textContent = view.portal;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("BOUGHT", view.buys, `across ${view.tokenCount} tokens`),
      metric("SOLD", view.sells),
      metric("TRADES", view.trades),
      metric(`FEES · ${view.tradesDay}`, view.fees),
    );
  document.querySelector("#chart-note").textContent =
    `the ${view.chartTokens} largest by buys plus sells`;
  document
    .querySelector("#chart")
    .replaceChildren(barChart(view.tokens, view.chartTokens));
  document.querySelector("#tokens").replaceChildren(
    ...view.tokens.map((token) => {
      const row = element("tr");
      row.append(
        element("td", token.label),
        element("td", token.trades),
        element("td", token.buys),
        element("td", token.sells),
        element("td", token.buyShare),
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
  const run = await (await fetch("/api/run")).json();
  renderRun(run);
  if (run.state === "running") setTimeout(poll, 1000);
}

document.querySelector("#fetch").addEventListener("click", async () => {
  renderRun(await (await fetch("/api/run", { method: "POST" })).json());
  poll();
});

poll();
