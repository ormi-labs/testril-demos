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

function hoursChart(hours) {
  const width = 1000;
  const height = 260;
  const pad = { left: 44, right: 12, top: 16, bottom: 28 };
  const peak = Math.max(...hours.map((h) => h.mints + h.trades));
  const slot = (width - pad.left - pad.right) / hours.length;
  const base = height - pad.bottom;
  const scale = (base - pad.top) / peak;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Mints and trades per approximate UTC hour",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: base,
      y2: base,
      class: "axis",
    }),
    svg("text", { x: pad.left - 8, y: pad.top + 4, class: "tick end" }, peak),
    svg("text", { x: pad.left - 8, y: base, class: "tick end" }, 0),
  );
  for (const { hour, mints, trades } of hours) {
    const x = pad.left + hour * slot + 2;
    const tradeHeight = trades * scale;
    const mintHeight = mints * scale;
    chart.append(
      svg("rect", {
        x,
        y: base - tradeHeight,
        width: slot - 4,
        height: tradeHeight,
        class: "bar trade",
      }),
      svg("rect", {
        x,
        y: base - tradeHeight - mintHeight,
        width: slot - 4,
        height: mintHeight,
        class: "bar mint",
      }),
    );
    if (hour % 3 === 0)
      chart.append(
        svg(
          "text",
          { x, y: height - 8, class: "tick" },
          `${String(hour).padStart(2, "0")}:00`,
        ),
      );
  }
  chart.append(
    svg(
      "text",
      { x: width - pad.right, y: pad.top + 4, class: "series-label end" },
      "trades below, mints above",
    ),
  );
  return chart;
}

function concentrationChart({ top, restFraction, restShare }) {
  const width = 1000;
  const height = 120;
  const pad = 12;
  const barTop = 24;
  const barHeight = 40;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Share of tokens held by the top holders",
  });
  let x = pad;
  const span = width - 2 * pad;
  const segments = [
    ...top.map((holder, i) => ({
      ...holder,
      label: String(i + 1),
      tone: `seg tone${i % 2}`,
    })),
    {
      fraction: restFraction,
      share: restShare,
      label: "rest",
      tone: "seg rest",
    },
  ];
  for (const segment of segments) {
    const w = segment.fraction * span;
    chart.append(
      svg("rect", {
        x,
        y: barTop,
        width: w,
        height: barHeight,
        class: segment.tone,
      }),
    );
    if (w > 30)
      chart.append(
        svg(
          "text",
          { x: x + w / 2, y: barTop + barHeight + 18, class: "tick middle" },
          segment.label,
        ),
      );
    x += w;
  }
  chart.append(
    svg(
      "text",
      { x: pad, y: 16, class: "series-label" },
      "top 10 holders, then everyone else",
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#eyebrow").textContent =
    `ETHEREUM · ${view.name.toUpperCase()} (${view.symbol})`;
  document.querySelector("#day-window").textContent =
    `${view.day} · ${view.dayWindow.from_block}–${view.dayWindow.to_block - 1}`;
  document.querySelector("#owners-window").textContent =
    `blocks ${view.ownersWindow.from_block}–${view.ownersWindow.to_block - 1}`;
  document.querySelector("#collection").textContent = view.collection;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(`MINTED · ${view.day}`, String(view.mints)),
      metric(
        `TRADED · ${view.day}`,
        String(view.trades),
        `${view.burns} burned`,
      ),
      metric("HOLDERS", view.holders, `${view.liveTokens} tokens held`),
      metric(
        "TOP 10 HOLD",
        view.concentration.topShare,
        `rest ${view.concentration.restShare}`,
      ),
    );
  document.querySelector("#hours").replaceChildren(hoursChart(view.hours));
  document.querySelector("#concentration-note").textContent =
    "after the last block of the day";
  document
    .querySelector("#concentration")
    .replaceChildren(concentrationChart(view.concentration));
  document.querySelector("#holders").replaceChildren(
    ...view.concentration.top.map((holder) => {
      const row = element("tr");
      row.append(
        element("td", holder.address),
        element("td", holder.tokens),
        element("td", holder.share),
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
