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

function funnelChart(steps) {
  const width = 1000;
  const rowHeight = 56;
  const labelWidth = 130;
  const max = Math.max(...steps.map((step) => step.count), 1);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${steps.length * rowHeight + 10}`,
    role: "img",
    "aria-label": "Tokens launched, graduated and with fees swept",
  });
  steps.forEach((step, i) => {
    const y = 10 + i * rowHeight;
    const barWidth = ((width - labelWidth - 80) * step.count) / max;
    chart.append(
      svg(
        "text",
        { x: labelWidth - 10, y: y + 24, class: "bar-label end" },
        step.label,
      ),
      svg("rect", {
        x: labelWidth,
        y,
        width: barWidth,
        height: 36,
        class: i === 2 ? "bar sweep" : "bar",
      }),
      svg(
        "text",
        { x: labelWidth + barWidth + 10, y: y + 24, class: "bar-label" },
        String(step.count),
      ),
    );
  });
  return chart;
}

function dailyChart(daily) {
  const width = 1000;
  const height = 240;
  const pad = { left: 70, right: 12, top: 16, bottom: 28 };
  const max = Math.max(...daily.map((d) => d.eth), 1e-9);
  const slot = (width - pad.left - pad.right) / daily.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "ETH of fees swept per day",
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
      { x: pad.left - 8, y: pad.top + 4, class: "tick end" },
      `${max.toFixed(2)} ETH`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, daily[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      daily.at(-1).day,
    ),
  );
  daily.forEach((d, i) => {
    const h = (d.eth / max) * (height - pad.top - pad.bottom);
    chart.append(
      svg("rect", {
        x: pad.left + i * slot + 2,
        y: height - pad.bottom - h,
        width: slot - 4,
        height: h,
        class: "bar sweep",
      }),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#launch-window").textContent =
    `${view.window.first} to ${view.window.last}`;
  document.querySelector("#fees-window").textContent =
    `${view.window.first} to ${view.window.last}`;
  const [launched, graduated] = view.funnel;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LAUNCHED", String(launched.count), "tokens on bonding curves"),
      metric(
        "GRADUATED",
        String(graduated.count),
        `${view.graduationRate} of launches`,
      ),
      metric("FEES SWEPT", view.swept, `curve volume ${view.volume}`),
      metric(
        "SPLIT",
        `${view.creatorShare} / ${view.buybackShare} / ${view.protocolShare}`,
        "creator / buyback / protocol",
      ),
    );
  document.querySelector("#funnel").replaceChildren(funnelChart(view.funnel));
  document.querySelector("#daily").replaceChildren(dailyChart(view.daily));
  document.querySelector("#tokens").replaceChildren(
    ...view.tokens.map((token) => {
      const row = element("tr");
      row.append(
        element("td", token.label),
        element("td", token.sweeps),
        element("td", token.creator),
        element("td", token.buyback),
        element("td", token.protocol),
        element("td", token.total),
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
