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

function dailyChart(daily) {
  const width = 1000;
  const height = 260;
  const pad = { left: 40, right: 12, top: 16, bottom: 28 };
  const peak = Math.max(1, ...daily.map((day) => day.in + day.out + day.self));
  const slot = (width - pad.left - pad.right) / daily.length;
  const unit = (height - pad.top - pad.bottom) / peak;
  const floor = height - pad.bottom;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Incoming and outgoing transfers per day",
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: floor,
      y2: floor,
      class: "axis",
    }),
    svg("text", { x: pad.left - 8, y: pad.top + 4, class: "tick end" }, peak),
  );
  daily.forEach((day, index) => {
    const x = pad.left + index * slot + slot * 0.15;
    const barWidth = slot * 0.7;
    chart.append(
      svg("rect", {
        x,
        y: floor - day.in * unit,
        width: barWidth,
        height: day.in * unit,
        class: "bar in",
      }),
      svg("rect", {
        x,
        y: floor - (day.in + day.out + day.self) * unit,
        width: barWidth,
        height: (day.out + day.self) * unit,
        class: "bar out",
      }),
      svg(
        "text",
        { x: x + barWidth / 2, y: height - 8, class: "tick middle" },
        `day ${index + 1}`,
      ),
    );
  });
  return chart;
}

function renderWallet(wallet, weekWindow) {
  document.querySelector("#address").textContent = wallet.address;
  document.querySelector("#week-window").textContent =
    `blocks ${weekWindow.from_block}–${weekWindow.to_block - 1}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("ENS NAME", wallet.name),
      metric("ETH BALANCE", wallet.balance, "at the last block of the window"),
      metric("TRANSFERS", String(wallet.transferCount), "in seven days"),
    );
  document
    .querySelector("#daily-chart")
    .replaceChildren(dailyChart(wallet.daily));
  document.querySelector("#list-note").textContent =
    `newest ${wallet.transfers.length} of ${wallet.transferCount}`;
  document.querySelector("#transfers").replaceChildren(
    ...wallet.transfers.map((transfer) => {
      const row = element("tr");
      row.append(
        element("td", String(transfer.block)),
        element("td", transfer.direction),
        element("td", transfer.counterparty),
        element("td", transfer.token),
        element("td", transfer.amount),
      );
      return row;
    }),
  );
}

function render(report) {
  const { wallets, weekWindow } = report.view;
  const picker = document.querySelector("#wallet");
  picker.replaceChildren(
    ...wallets.map((wallet, index) => {
      const option = element("option", wallet.name);
      option.value = String(index);
      return option;
    }),
  );
  picker.onchange = () =>
    renderWallet(wallets[Number(picker.value)], weekWindow);
  renderWallet(wallets[0], weekWindow);
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
