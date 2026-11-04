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

function timelineChart(timeline) {
  const width = 1000;
  const pad = { left: 70, right: 16 };
  const price = { top: 16, bottom: 210 };
  const burns = { top: 250, bottom: 420 };
  const x = (i) =>
    pad.left + (i / (timeline.length - 1)) * (width - pad.left - pad.right);
  const prices = timeline.map((point) => point.priceValue);
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const priceY = (v) =>
    price.bottom - ((v - low) / (high - low || 1)) * (price.bottom - price.top);
  const bars = timeline.map((point) => point.netBurnMillions);
  const reach = Math.max(...bars.map(Math.abs)) || 1;
  const zero = (burns.top + burns.bottom) / 2;
  const barY = (v) => zero - (v / reach) * ((burns.bottom - burns.top) / 2);
  const barWidth = Math.max(
    (width - pad.left - pad.right) / timeline.length - 1,
    1,
  );
  const chart = svg("svg", {
    viewBox: `0 0 ${width} 440`,
    role: "img",
    "aria-label": "Chainlink USDC/USD answer and net USDC burns per hour",
  });
  chart.append(
    svg(
      "text",
      { x: pad.left, y: price.top - 4, class: "series-label" },
      "Chainlink USDC/USD",
    ),
    svg(
      "text",
      { x: pad.left - 8, y: priceY(high) + 4, class: "tick end" },
      `$${high.toFixed(3)}`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: priceY(low) + 4, class: "tick end" },
      `$${low.toFixed(3)}`,
    ),
    svg("polyline", {
      points: prices.map((v, i) => `${x(i)},${priceY(v)}`).join(" "),
      class: "line",
    }),
    svg(
      "text",
      { x: pad.left, y: burns.top - 8, class: "series-label" },
      "Net burn per hour (burned − minted)",
    ),
    svg(
      "text",
      { x: pad.left - 8, y: barY(reach) + 4, class: "tick end" },
      `+${reach.toFixed(0)}M`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: barY(-reach) + 4, class: "tick end" },
      `−${reach.toFixed(0)}M`,
    ),
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: zero,
      y2: zero,
      class: "axis",
    }),
  );
  timeline.forEach((point, i) => {
    const y = barY(point.netBurnMillions);
    chart.append(
      svg("rect", {
        x: x(i) - barWidth / 2,
        y: Math.min(y, zero),
        width: barWidth,
        height: Math.max(Math.abs(y - zero), 0.5),
        class: point.netBurnMillions >= 0 ? "burn" : "mint",
      }),
    );
  });
  chart.append(
    svg("text", { x: pad.left, y: 436, class: "tick" }, timeline[0].label),
    svg(
      "text",
      { x: width - pad.right, y: 436, class: "tick end" },
      timeline.at(-1).label,
    ),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#hour-window").textContent =
    `${view.hourWindow.from_hour} to ${view.hourWindow.to_hour} (exclusive)`;
  document.querySelector("#edges-window").textContent =
    `blocks ${view.edgesWindow.from_block}–${view.edgesWindow.to_block - 1}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("LOWEST ANSWER", view.lowest.price, view.lowest.hour),
      metric("PEAK NET BURN", view.peakBurn.amount, view.peakBurn.hour),
      metric("USDC BURNED", view.burned),
      metric(
        "USDC MINTED",
        view.minted,
        view.net.startsWith("−")
          ? `net mint ${view.net.replace("−", "+")}`
          : `net burn ${view.net}`,
      ),
    );
  document
    .querySelector("#timeline")
    .replaceChildren(timelineChart(view.timeline));
  document.querySelector("#burners").replaceChildren(
    ...view.burners.map((burner) => {
      const row = element("tr");
      row.append(
        element("td", burner.address),
        element("td", burner.burns),
        element("td", burner.share),
        element("td", burner.amount),
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
  const run = await (await fetch("/api/run")).json();
  renderRun(run);
  if (run.state === "running") setTimeout(poll, 1000);
}

document.querySelector("#fetch").addEventListener("click", async () => {
  renderRun(await (await fetch("/api/run", { method: "POST" })).json());
  poll();
});

poll();
