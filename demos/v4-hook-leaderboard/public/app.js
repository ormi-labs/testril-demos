const svgNs = "http://www.w3.org/2000/svg";
const kinds = { Arrakis: "arrakis", "No hook": "none", Unlabelled: "" };

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
  node.append(element("span", note));
  return node;
}

function barChart(hooks, count) {
  const shown = hooks.slice(0, count);
  const width = 1000;
  const rowHeight = 34;
  const [labelWidth, valueWidth] = [220, 110];
  const max = Math.max(...shown.map((hook) => hook.swapCount));
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${shown.length * rowHeight + 10}`,
    role: "img",
    "aria-label": "Swaps per hook",
  });
  shown.forEach((hook, index) => {
    const y = 10 + index * rowHeight;
    const length =
      (hook.swapCount / max) * (width - labelWidth - valueWidth - 20);
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 15, class: "bar-label end" },
        `${hook.label} ${hook.address}`.replace(/ —$/, ""),
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: Math.max(length, 1),
        height: rowHeight - 12,
        class: `bar ${kinds[hook.label]}`,
      }),
      svg(
        "text",
        { x: labelWidth + length + 8, y: y + 15, class: "tick" },
        hook.swaps,
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#pools-window").textContent =
    `${view.poolsWindow.from_block}–${view.poolsWindow.to_block - 1}`;
  document.querySelector("#volume-window").textContent =
    `${view.volumeWindow.from_day} to ${view.volumeWindow.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("SWAPS", view.totalSwaps, `${view.totalVolume} stablecoin volume`),
      metric("SWAPS THROUGH HOOKS", view.hookedShare, "of all swaps"),
      metric("HOOKS WITH SWAPS", view.hookCount, "excluding no hook"),
      metric("ARRAKIS HOOKS", view.arrakisCount, `${view.arrakisSwaps} swaps`),
    );
  document
    .querySelector("#chart")
    .replaceChildren(barChart(view.hooks, view.chartedHooks));
  document.querySelector("#hooks").replaceChildren(
    ...view.hooks.map((hook) => {
      const row = element("tr");
      row.append(
        element("td", hook.address),
        element("td", hook.label),
        element("td", hook.pools),
        element("td", hook.swaps),
        element("td", hook.volume),
      );
      return row;
    }),
  );
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
  const run = await (await fetch("/api/run")).json();
  renderRun(run);
  if (run.state === "running") setTimeout(poll, 1000);
}

document.querySelector("#fetch").addEventListener("click", async () => {
  renderRun(await (await fetch("/api/run", { method: "POST" })).json());
  poll();
});

poll();
