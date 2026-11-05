const svgNs = "http://www.w3.org/2000/svg";
const flowPairs = 10;
const zeroAddress = `0x${"0".repeat(40)}`;

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

function lineChart({ symbol, series }) {
  const width = 520;
  const height = 220;
  const pad = { left: 64, right: 12, top: 16, bottom: 28 };
  const values = series.map((point) => point.millions);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) =>
    pad.left + (i / (series.length - 1)) * (width - pad.left - pad.right);
  const y = (v) =>
    pad.top +
    (1 - (v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${symbol} total supply per day`,
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
      { x: pad.left - 8, y: y(max) + 4, class: "tick end" },
      `${(max / 1000).toFixed(2)}B`,
    ),
    svg(
      "text",
      { x: pad.left - 8, y: y(min) + 4, class: "tick end" },
      `${(min / 1000).toFixed(2)}B`,
    ),
    svg("text", { x: pad.left, y: height - 8, class: "tick" }, series[0].day),
    svg(
      "text",
      { x: width - pad.right, y: height - 8, class: "tick end" },
      series.at(-1).day,
    ),
    svg(
      "text",
      { x: pad.left + 8, y: pad.top + 4, class: "series-label" },
      symbol,
    ),
    svg("polyline", {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      class: "line",
    }),
  );
  return chart;
}

function stack(names, totals, scale, gap, top) {
  const positions = new Map();
  let y = top;
  for (const name of names) {
    positions.set(name, { y, used: 0 });
    y += totals.get(name) * scale + gap;
  }
  return positions;
}

function flowChart(pairs) {
  const width = 1000;
  const height = 440;
  const gap = 10;
  const [left, right] = [230, 770];
  const top = pairs.slice(0, flowPairs);
  const sum = (key) => {
    const totals = new Map();
    for (const pair of top)
      totals.set(pair[key], (totals.get(pair[key]) ?? 0) + pair.millions);
    return totals;
  };
  const out = sum("from");
  const into = sum("to");
  const total = top.reduce((s, pair) => s + pair.millions, 0);
  const scale =
    (height - gap * (Math.max(out.size, into.size) - 1) - 20) / total;
  const senders = stack([...out.keys()], out, scale, gap, 10);
  const recipients = stack([...into.keys()], into, scale, gap, 10);
  const label = new Map(
    top.flatMap((p) => [
      [p.from, p.fromLabel],
      [p.to, p.toLabel],
    ]),
  );
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Largest USDC flows from sender to recipient",
  });
  for (const pair of top) {
    const from = senders.get(pair.from);
    const to = recipients.get(pair.to);
    const h = Math.max(pair.millions * scale, 1);
    const [y0, y1] = [from.y + from.used, to.y + to.used];
    from.used += h;
    to.used += h;
    const mid = (left + right) / 2;
    chart.append(
      svg("path", {
        d: `M${left},${y0} C${mid},${y0} ${mid},${y1} ${right},${y1} L${right},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${left},${y0 + h} Z`,
        class: [pair.from, pair.to].includes(zeroAddress)
          ? "band zero"
          : "band",
      }),
    );
  }
  for (const [nodes, totals, x, anchor] of [
    [senders, out, left - 8, "end"],
    [recipients, into, right + 8, "start"],
  ])
    for (const [address, { y }] of nodes) {
      const h = totals.get(address) * scale;
      chart.append(
        svg("rect", {
          x: anchor === "end" ? left - 4 : right,
          y,
          width: 4,
          height: Math.max(h, 1),
          class: "node",
        }),
        svg(
          "text",
          { x, y: y + h / 2 + 4, class: `node-label ${anchor}` },
          label.get(address),
        ),
      );
    }
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#supply-window").textContent =
    `${view.supplyDays.first} to ${view.supplyDays.last}`;
  document.querySelector("#edges-window").textContent =
    `${view.edgesDay}, 00:00 to 24:00 UTC`;
  document
    .querySelector("#headline")
    .replaceChildren(
      ...view.tokens.map((t) =>
        metric(`${t.symbol} SUPPLY`, t.latest, `${t.change} over the month`),
      ),
      metric(`USDC MINTED · ${view.edgesDay}`, view.minted),
      metric(`USDC BURNED · ${view.edgesDay}`, view.burned, `net ${view.net}`),
    );
  document
    .querySelector("#supply-chart")
    .replaceChildren(...view.tokens.map(lineChart));
  document.querySelector("#flow-note").textContent =
    `the ${flowPairs} largest pairs on ${view.edgesDay}; mints and burns use the zero address`;
  document.querySelector("#flow").replaceChildren(flowChart(view.pairs));
  document.querySelector("#pairs").replaceChildren(
    ...view.pairs.map((pair) => {
      const row = element("tr");
      row.append(
        element("td", pair.fromLabel),
        element("td", pair.toLabel),
        element("td", pair.transfers),
        element("td", pair.amount),
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
