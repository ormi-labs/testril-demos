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

function splitChart(venues) {
  const width = 1000;
  const rowHeight = 64;
  const [labelWidth, right] = [250, 80];
  const barHeight = 28;
  const height = venues.length * rowHeight + 20;
  const widest = Math.max(
    1e-6,
    ...venues.map((v) => v.hookedMillions + v.hooklessMillions),
  );
  const scale = (width - labelWidth - right) / widest;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Hooked and hookless volume per venue",
  });
  venues.forEach((venue, index) => {
    const y = 10 + index * rowHeight + (rowHeight - barHeight) / 2;
    const hookedWidth = venue.hookedMillions * scale;
    chart.append(
      svg(
        "text",
        { x: labelWidth - 12, y: y + 18, class: "node-label end" },
        venue.name,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: venue.hooklessMillions * scale,
        height: barHeight,
        class: "bar hookless",
      }),
      svg("rect", {
        x: labelWidth + venue.hooklessMillions * scale,
        y,
        width: hookedWidth,
        height: barHeight,
        class: "bar hooked",
      }),
      svg(
        "text",
        {
          x:
            labelWidth +
            (venue.hooklessMillions + venue.hookedMillions) * scale +
            8,
          y: y + 18,
          class: "node-label",
        },
        venue.hookedShare,
      ),
    );
  });
  return chart;
}

function legend() {
  const node = element("p", undefined, "legend");
  node.append(
    element("span", "Hookless", "swatch hookless"),
    element(
      "span",
      "Hooked (share printed at the end of each bar)",
      "swatch hooked",
    ),
  );
  return node;
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
  document.querySelector("#day-window").textContent =
    `${view.dayWindow.first} to ${view.dayWindow.last}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.dexes.map((dex) =>
        metric(
          `${dex.dex} hooked`,
          dex.hookedShare,
          `${dex.hooked} of ${dex.total}`,
        ),
      ),
      ...view.dexes.map((dex) =>
        metric(
          `${dex.dex} hook pools`,
          String(dex.activeHookedPools),
          `of ${dex.activePools} pools that traded`,
        ),
      ),
    );
  document
    .querySelector("#split")
    .replaceChildren(splitChart(view.venues), legend());
  document.querySelector("#pools").replaceChildren(
    ...view.hookedPools.map((pool) => {
      const row = element("tr");
      row.append(
        element("td", pool.venue),
        element("td", pool.pair),
        element("td", pool.pool),
        element("td", pool.hooks),
        element("td", pool.swaps),
        element("td", pool.stable),
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
