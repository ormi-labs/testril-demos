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

function lineChart({ symbol, low, high, points }) {
  const width = 1000;
  const height = 240;
  const pad = { left: 120, right: 12, top: 16, bottom: 28 };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} held per day`,
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
      `${high} ${symbol}`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      `${low} ${symbol}`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, points[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      points.at(-1).day,
    ),
    svg("polyline", {
      points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function holdingsTable(card) {
  const table = element("table");
  const head = element("tr");
  head.append(
    element("th", "Asset"),
    element("th", "Latest"),
    element("th", `Change over ${card.dayCount} days`),
    element("th", "By wallet"),
  );
  const body = element("tbody");
  for (const holding of card.holdings) {
    const row = element("tr");
    row.append(
      element("td", holding.symbol),
      element("td", holding.latest),
      element("td", holding.change),
      element(
        "td",
        holding.wallets.map((w) => `${w.label} ${w.amount}`).join(" · "),
      ),
    );
    body.append(row);
  }
  const header = element("thead");
  header.append(head);
  table.append(header, body);
  return table;
}

function cardNode(card) {
  const section = element("section", undefined, "results");
  const heading = element("div", undefined, "section-heading");
  heading.append(
    element("h2", card.name),
    element("span", `${card.chain} · ${card.window}`),
  );
  const chart = element("div", undefined, "chart");
  chart.append(lineChart(card.line));
  const table = element("div", undefined, "table-wrap");
  table.append(holdingsTable(card));
  section.append(heading, chart, table);
  return section;
}

function render(report) {
  const view = report.view;
  document.querySelector("#scope").replaceChildren(
    ...view.scope.map(({ label, value }) => {
      const node = element("div");
      node.append(element("span", label, "label"), element("strong", value));
      return node;
    }),
  );
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.headline.map(({ label, value, note }) =>
        metric(label, value, note),
      ),
    );
  document.querySelector("#cards").replaceChildren(...view.cards.map(cardNode));
  document
    .querySelector("#checks")
    .replaceChildren(
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
