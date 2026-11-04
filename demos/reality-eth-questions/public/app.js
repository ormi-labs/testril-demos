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

function ladderChart(ladder) {
  const width = 1000;
  const height = 320;
  const pad = { left: 16, right: 16, top: 28, bottom: 52 };
  const levels = ladder.map((step) => step.level);
  const low = Math.min(...levels) - 1;
  const high = Math.max(...levels);
  const slot = (width - pad.left - pad.right) / ladder.length;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Bond staked on each answer, on a doubling scale",
  });
  ladder.forEach((step, i) => {
    const barHeight =
      ((step.level - low) / (high - low)) * (height - pad.top - pad.bottom);
    const x = pad.left + i * slot;
    const centre = x + slot / 2;
    chart.append(
      svg("rect", {
        x: x + slot * 0.15,
        y: height - pad.bottom - barHeight,
        width: slot * 0.7,
        height: barHeight,
        class: i === ladder.length - 1 ? "bar last" : "bar",
      }),
      svg(
        "text",
        {
          x: centre,
          y: height - pad.bottom - barHeight - 8,
          class: "value middle",
        },
        step.bond,
      ),
      svg("text", { x: centre, y: height - 28, class: "middle" }, step.answer),
      svg(
        "text",
        { x: centre, y: height - 10, class: "middle" },
        `answer ${i + 1}`,
      ),
    );
  });
  chart.append(
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: height - pad.bottom,
      y2: height - pad.bottom,
      class: "axis",
    }),
  );
  return chart;
}

function render(report) {
  const view = report.view;
  for (const window of view.windows)
    document.querySelector(
      `#window-${window.chain.toLowerCase()}`,
    ).textContent = `${window.from_block}–${window.to_block - 1}`;
  document
    .querySelector("#headline")
    .replaceChildren(
      metric("QUESTIONS ASKED", view.asked, `${view.answered} got an answer`),
      metric("ANSWERS GIVEN", view.answers),
      metric("MOST ROUNDS ON ONE QUESTION", view.mostRounds),
      ...view.highestBonds.map(({ chain, bond }) =>
        metric(`HIGHEST BOND ON ${chain.toUpperCase()}`, bond),
      ),
    );
  document.querySelector("#ladder-note").textContent =
    `${view.contested.title} (${view.contested.chain}); each step up is one doubling of the bond (log scale)`;
  document
    .querySelector("#ladder")
    .replaceChildren(ladderChart(view.contested.ladder));
  document.querySelector("#questions").replaceChildren(
    ...view.questions.map((question) => {
      const row = element("tr");
      row.append(
        element("td", question.title),
        element("td", question.chain),
        element("td", String(question.answers)),
        element("td", question.topBond),
        element("td", question.leading),
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
