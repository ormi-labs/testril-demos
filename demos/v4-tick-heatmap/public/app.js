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

function histogram({ bars, marker }) {
  const width = 1000;
  const height = 340;
  const pad = { left: 16, right: 16, top: 28, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const step = plotWidth / bars.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label":
      "In-range liquidity at each price, with the current price marked",
  });
  bars.forEach((bar, i) => {
    const barHeight = Math.max(bar.height * plotHeight, 1);
    const node = svg("rect", {
      x: pad.left + i * step + 1,
      y: pad.top + plotHeight - barHeight,
      width: step - 2,
      height: barHeight,
      class: "bar",
    });
    node.append(svg("title", {}, `${bar.price} · ${bar.liquidity} liquidity`));
    chart.append(node);
  });
  const markerX = pad.left + marker * plotWidth;
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: pad.top + plotHeight,
      y2: pad.top + plotHeight,
      class: "axis",
    }),
    svg("line", {
      x1: markerX,
      x2: markerX,
      y1: pad.top - 8,
      y2: pad.top + plotHeight,
      class: "marker",
    }),
    svg(
      "text",
      { x: markerX + 6, y: pad.top + 2, class: "marker-label" },
      "current price",
    ),
    svg("text", { x: pad.left, y: height - 10, class: "tick" }, bars[0].price),
    svg(
      "text",
      { x: width - pad.right, y: height - 10, class: "tick end" },
      bars.at(-1).price,
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#pool-id").textContent =
    `${view.pool.pair} ${view.pool.fee} · ${view.pool.id.slice(0, 10)}…`;
  document.querySelector("#tick-window").textContent =
    `${view.ticksSince} to ${view.stateDay}`;
  document.querySelector("#state-day").textContent =
    `${view.stateDay}, end of day`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("PRICE · USDC PER ETH", view.price),
      metric("CURRENT TICK", view.currentTick),
      metric("IN-RANGE LIQUIDITY", view.liquidity),
      metric("INITIALIZED TICKS", view.initializedTicks),
    );
  document.querySelector("#histogram-note").textContent =
    `${view.bars.length} buckets of 100 ticks (about 1% each) around the current price`;
  document.querySelector("#histogram").replaceChildren(histogram(view));
  document.querySelector("#ticks").replaceChildren(
    ...view.ticks.map((tick) => {
      const row = element("tr");
      row.append(
        element("td", tick.tick),
        element("td", tick.price),
        element("td", tick.side),
        element("td", tick.gross),
        element("td", tick.net),
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
