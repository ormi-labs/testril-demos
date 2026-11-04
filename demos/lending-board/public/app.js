const svgNs = "http://www.w3.org/2000/svg";
const venues = [
  ["aaveIdle", "Aave v3 unlent liquidity"],
  ["markets", "Morpho markets (idle)"],
  ["vaults", "Morpho vault balances (idle)"],
];

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

function tableRows(rows, columns) {
  return rows.map((row) => {
    const tr = element("tr");
    tr.append(...columns.map((column) => element("td", row[column])));
    return tr;
  });
}

function stackedBars(byVenue) {
  const width = 1000;
  const height = 320;
  const pad = { left: 64, right: 12, top: 16, bottom: 30 };
  const total = (day) => day.aaveIdle + day.markets + day.vaults;
  const max = Math.max(...byVenue.map(total));
  const slot = (width - pad.left - pad.right) / byVenue.length;
  const barWidth = slot * 0.6;
  const scale = (height - pad.top - pad.bottom) / max;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Idle USDC in Aave, Morpho markets and Morpho vaults per day",
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
      `${(max / 1000).toFixed(1)}B`,
    ),
  );
  byVenue.forEach((day, i) => {
    const x = pad.left + i * slot + (slot - barWidth) / 2;
    let y = height - pad.bottom;
    venues.forEach(([key], venueIndex) => {
      const h = day[key] * scale;
      y -= h;
      chart.append(
        svg("rect", {
          x,
          y,
          width: barWidth,
          height: Math.max(h, 0.5),
          class: `venue venue-${venueIndex}`,
        }),
      );
    });
    chart.append(
      svg(
        "text",
        { x: x + barWidth / 2, y: height - 10, class: "tick middle" },
        day.day.slice(5),
      ),
    );
  });
  return chart;
}

function render(report) {
  const view = report.view;
  document.querySelector("#state-window").textContent =
    `${view.stateWindow.from_hour} to ${view.stateWindow.to_hour} (exclusive)`;
  document.querySelector("#totals-window").textContent =
    `read at blocks ${view.totalsWindow.from_block}–${view.totalsWindow.to_block - 1}`;
  document.querySelector("#holdings-window").textContent =
    `${view.holdingsWindow.from_day} to ${view.holdingsWindow.to_day} (exclusive)`;
  const { headline } = view;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric(
        "USDC UTILIZATION",
        headline.usdcUtilization,
        `${view.reserveCount} reserves listed`,
      ),
      metric("USDC BORROW APR", headline.usdcBorrowApr),
      metric(
        "USDC LIQUIDATED",
        headline.usdcLiquidated,
        "collateral, lifetime",
      ),
      metric("USDC FLASH PREMIUMS", headline.usdcFlashPremium, "lifetime"),
    );
  document
    .querySelector("#board")
    .replaceChildren(
      ...tableRows(view.board, [
        "symbol",
        "supplyApr",
        "borrowApr",
        "utilization",
        "supplied",
        "borrowed",
      ]),
    );
  document
    .querySelector("#totals")
    .replaceChildren(
      ...tableRows(view.totals, [
        "symbol",
        "liquidated",
        "flashLoaned",
        "flashPremium",
      ]),
    );
  document.querySelector("#by-venue-note").textContent =
    "idle USDC in billions, at each day's last sample; Aave unlent = aToken supply minus variable debt";
  document
    .querySelector("#by-venue")
    .replaceChildren(stackedBars(view.byVenue));
  document.querySelector("#legend").replaceChildren(
    ...venues.map(([key, name], i) => {
      const item = element("li", `${name} · ${view.byVenueLatest[key]}`);
      item.prepend(element("span", "", `swatch venue-${i}`));
      return item;
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
