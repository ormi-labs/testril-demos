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

function barChart({ symbol, bars }) {
  const width = 520;
  const height = 220;
  const pad = { left: 12, right: 12, top: 28, bottom: 28 };
  const max = Math.max(...bars.map((bar) => bar.value));
  const slot = (width - pad.left - pad.right) / bars.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} volume per day`,
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
      { x: pad.left + 4, y: pad.top - 10, class: "series-label" },
      symbol,
    ),
    svg(
      "text",
      { x: pad.left, y: height - 8, class: "tick" },
      bars[0].day.slice(5),
    ),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      bars.at(-1).day.slice(5),
    ),
  );
  bars.forEach((bar, i) => {
    const h = max ? (bar.value / max) * (height - pad.top - pad.bottom) : 0;
    const rect = svg("rect", {
      x: pad.left + i * slot + slot * 0.15,
      y: height - pad.bottom - h,
      width: slot * 0.7,
      height: h,
      class: "bar",
    });
    rect.append(svg("title", {}, `${bar.day}: ${bar.label} (${bar.count})`));
    chart.append(rect);
  });
  return chart;
}

function venueSection(venue) {
  const section = element("section", undefined, "results");
  const heading = element("div", undefined, "section-heading");
  heading.append(
    element("h2", venue.title),
    element("span", `${venue.functionSlug} · each token on its own scale`),
  );
  const charts = element("div", undefined, "charts");
  charts.append(...venue.tokens.map(barChart));
  section.append(heading, charts);
  return section;
}

function render(report) {
  const view = report.view;
  document.querySelector("#window").textContent =
    `${view.window.from_day} to ${view.window.to_day} (exclusive)`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.venues.map((venue) =>
        metric(
          venue.title.toUpperCase(),
          venue.count,
          `${venue.unit} across ${venue.tokens.length} tokens`,
        ),
      ),
    );
  document
    .querySelector("#venues")
    .replaceChildren(...view.venues.map(venueSection));
  document.querySelector("#venue-table").replaceChildren(
    ...view.venues.flatMap((venue) =>
      venue.tokens.map((token) => {
        const row = element("tr");
        row.append(
          element("td", venue.title),
          element("td", token.symbol),
          element("td", token.count),
          element("td", token.total),
        );
        return row;
      }),
    ),
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
