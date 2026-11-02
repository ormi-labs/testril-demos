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

function banner(report) {
  const node = document.querySelector("#source");
  if (report.source === "synthetic") {
    node.textContent = "Synthetic fixture — not real data";
    node.classList.add("synthetic");
  } else
    node.textContent = `Recorded from Testril on ${report.recordedAt.slice(0, 10)}`;
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
  banner(report);
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

const response = await fetch("/api/report");
render(await response.json());
