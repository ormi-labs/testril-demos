const svgNs = "http://www.w3.org/2000/svg";
const labelThreshold = 0.07;

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

const venueClass = (venue) =>
  `venue-${venue.split(" (")[0].toLowerCase().replace(/\W+/g, "-")}`;

function metric(label, value, note) {
  const node = element("div");
  node.append(element("span", label, "label"), element("strong", value));
  if (note) node.append(element("span", note));
  return node;
}

function stackedChart(pair) {
  const width = 1000;
  const height = 360;
  const pad = { left: 52, right: 12, top: 16, bottom: 30 };
  const slot = (width - pad.left - pad.right) / pair.days.length;
  const barWidth = slot * 0.7;
  const plotHeight = height - pad.top - pad.bottom;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${pair.title} volume share by venue per day`,
  });
  for (const tick of [0, 0.5, 1])
    chart.append(
      svg(
        "text",
        {
          x: pad.left - 8,
          y: pad.top + (1 - tick) * plotHeight + 4,
          class: "tick end",
        },
        `${tick * 100}%`,
      ),
    );
  pair.days.forEach((day, i) => {
    const x = pad.left + i * slot + (slot - barWidth) / 2;
    let top = pad.top + plotHeight;
    for (const share of day.shares) {
      const h = share.fraction * plotHeight;
      top -= h;
      const title = svg(
        "title",
        {},
        `${day.day} ${share.venue}: ${share.percent} (${share.eth})`,
      );
      const segment = svg("rect", {
        x,
        y: top,
        width: barWidth,
        height: h,
        class: `segment ${venueClass(share.venue)}`,
      });
      segment.append(title);
      chart.append(segment);
      if (share.fraction >= labelThreshold)
        chart.append(
          svg(
            "text",
            { x: x + barWidth / 2, y: top + h / 2 + 4, class: "segment-label" },
            share.percent,
          ),
        );
    }
    chart.append(
      svg(
        "text",
        { x: x + barWidth / 2, y: height - 9, class: "tick middle" },
        day.day.slice(5),
      ),
    );
  });
  return chart;
}

function legend(pair) {
  return pair.overall.map((entry) => {
    const item = element("li");
    item.append(
      element("span", "", `swatch ${venueClass(entry.venue)}`),
      element("span", `${entry.venue} ${entry.percent}`),
      element("span", entry.eth, "muted"),
    );
    return item;
  });
}

function renderPair(pair) {
  document
    .querySelector(`#chart-${pair.id}`)
    .replaceChildren(stackedChart(pair));
  document.querySelector(`#legend-${pair.id}`).replaceChildren(...legend(pair));
}

function render(report) {
  const { view } = report;
  const [ethUsdc, wsteth] = view.pairs;
  const { headline } = view;
  document.querySelector("#window").textContent =
    `${view.window.first} to ${view.window.last}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "ETH/USDC VOLUME",
        headline.volume,
        "selected pools, whole window",
      ),
      metric(
        "LARGEST VENUE",
        headline.leader,
        `${headline.leaderShare} of selected ETH/USDC pools`,
      ),
      metric(
        "LARGEST V3 TIER",
        headline.topTier.tier,
        `${headline.topTier.percent} of v3 ETH/USDC`,
      ),
      metric(
        "FLUID IN WSTETH/ETH (2 POOLS)",
        headline.fluidSteth,
        `${headline.fluidUsdc} of selected ETH/USDC pools`,
      ),
    );
  renderPair(ethUsdc);
  renderPair(wsteth);
  document.querySelector("#tier-note").textContent =
    "ETH/USDC pools of the v3 factory, whole window";
  document.querySelector("#tiers").replaceChildren(
    ...view.tiers.map((tier) => {
      const row = element("tr");
      row.append(
        element("td", tier.tier),
        element("td", tier.pool),
        element("td", tier.eth),
        element("td", tier.percent),
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
