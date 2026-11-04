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

function barChart(epochs) {
  const width = 1000;
  const height = 260;
  const pad = { left: 56, right: 12, top: 16, bottom: 30 };
  const max = Math.max(...epochs.map((epoch) => epoch.thousands));
  const slot = (width - pad.left - pad.right) / epochs.length;
  const baseline = height - pad.bottom;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Query fees collected per epoch",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: baseline,
      y2: baseline,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 8, y: pad.top + 4, class: "tick end" },
      `${max.toFixed(1)}K`,
    ),
    svg("text", { x: pad.left - 8, y: baseline, class: "tick end" }, "0"),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      `epoch ${epochs[0].epoch}`,
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      `epoch ${epochs.at(-1).epoch}`,
    ),
  );
  epochs.forEach((epoch, index) => {
    const barHeight = (epoch.thousands / max) * (baseline - pad.top);
    const bar = svg("rect", {
      x: pad.left + index * slot + 1,
      y: baseline - barHeight,
      width: Math.max(slot - 2, 1),
      height: barHeight,
      class: "bar",
    });
    bar.append(svg("title", {}, `epoch ${epoch.epoch}: ${epoch.total}`));
    chart.append(bar);
  });
  return chart;
}

function indexerRow(indexer) {
  const row = element("tr");
  row.append(
    element("td", String(indexer.rank)),
    element("td", indexer.label),
    element("td", indexer.rewards),
    element("td", indexer.delegatorRewards),
    element("td", indexer.delegatorShare),
    element("td", indexer.pool),
    element("td", indexer.delegatorYield),
  );
  return row;
}

function render(report) {
  const view = report.view;
  document.querySelector("#window").textContent =
    `${view.window.from_block}–${view.window.to_block - 1}`;
  document.querySelector("#epochs").textContent =
    `${view.epochs.first} to ${view.epochs.last}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("INDEXING REWARDS", view.rewards),
      metric("TO DELEGATORS", view.delegatorShare, "of split rewards"),
      metric(
        "NET DELEGATION",
        view.netDelegation,
        "delegated minus undelegated",
      ),
      metric("QUERY FEES", view.queryFees),
    );
  document
    .querySelector("#fees-chart")
    .replaceChildren(barChart(view.queryFeesPerEpoch));
  document
    .querySelector("#indexers")
    .replaceChildren(...view.indexers.map(indexerRow));
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
