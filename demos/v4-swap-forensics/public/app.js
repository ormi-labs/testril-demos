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

function hourlyChart(hours) {
  const width = 1000;
  const height = 260;
  const pad = { left: 40, right: 12, top: 20, bottom: 28 };
  const max = Math.max(...hours.map((h) => h.swaps));
  const slot = (width - pad.left - pad.right) / hours.length;
  const base = height - pad.bottom;
  const barHeight = (swaps) => (swaps / max) * (base - pad.top);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Swaps per UTC hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: base,
      y2: base,
      class: "axis",
    }),
    svg(
      "text",
      { x: pad.left - 6, y: pad.top + 4, class: "tick end" },
      String(max),
    ),
  );
  hours.forEach((hour, i) => {
    const x = pad.left + i * slot;
    const top = base - barHeight(hour.swaps);
    chart.append(
      svg("rect", {
        x: x + 3,
        y: top,
        width: slot - 6,
        height: barHeight(hour.swaps),
        class: "bar",
      }),
      svg(
        "text",
        { x: x + slot / 2, y: height - 8, class: "tick middle" },
        hour.hour,
      ),
    );
    if (hour.jit)
      chart.append(
        svg("circle", {
          cx: x + slot / 2 - 5,
          cy: top - 8,
          r: 4,
          class: "mark-jit",
        }),
      );
    if (hour.sandwiches)
      chart.append(
        svg("circle", {
          cx: x + slot / 2 + 5,
          cy: top - 8,
          r: 4,
          class: "mark-sandwich",
        }),
      );
  });
  return chart;
}

function link(tx) {
  const anchor = element("a", tx.hash);
  anchor.href = tx.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function row(...cells) {
  const tr = element("tr");
  for (const cell of cells) {
    const td = element("td");
    td.append(cell);
    tr.append(td);
  }
  return tr;
}

function fillTable(id, items, cells) {
  document
    .querySelector(id)
    .replaceChildren(
      ...(items.length
        ? items.map((item) => row(...cells(item)))
        : [row("None found in this window")]),
    );
}

function setupTabs() {
  const tabs = [...document.querySelectorAll("[role=tab]")];
  const select = (selected) =>
    tabs.forEach((tab) => {
      const on = tab === selected;
      tab.setAttribute("aria-selected", String(on));
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    });
  tabs.forEach((tab) => tab.addEventListener("click", () => select(tab)));
  select(tabs[0]);
}

function render(report) {
  const view = report.view;
  document.querySelector("#day").textContent = view.day;
  document.querySelector("#blocks").textContent =
    `${view.blockWindow.from_block}–${view.blockWindow.to_block - 1}`;
  document.querySelector("#tokens").textContent = view.tokens
    .map((t) => t.symbol)
    .join(" · ");
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("SWAPS", view.counts.swaps),
      metric("LIQUIDITY CHANGES", view.counts.liquidity),
      metric("JIT EVENTS", view.counts.jit),
      metric("SANDWICHES", view.counts.sandwiches),
    );
  document.querySelector("#hourly").replaceChildren(hourlyChart(view.hourly));
  fillTable("#biggest", view.biggest, (s) => [
    s.rank,
    s.pool,
    s.direction,
    s.sender,
    s.block,
    s.size,
    link(s.tx),
  ]);
  fillTable("#jit", view.jit, (j) => [
    j.block,
    j.pool,
    j.sender,
    j.ticks,
    j.liquidity,
    link(j.add),
    link(j.swap),
    link(j.remove),
  ]);
  fillTable("#sandwiches", view.sandwiches, (s) => [
    s.block,
    s.pool,
    s.attacker,
    s.victim,
    s.direction,
    link(s.front),
    link(s.victimTx),
    link(s.back),
  ]);
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(report.checks.ok
        ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${report.checks.error}`, "failed")]),
    );
}

setupTabs();
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
