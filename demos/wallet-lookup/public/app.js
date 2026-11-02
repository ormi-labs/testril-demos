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
  banner(report);
  const picker = document.querySelector("#wallet");
  picker.replaceChildren(
    ...wallets.map((wallet, index) => {
      const option = element("option", wallet.name);
      option.value = String(index);
      return option;
    }),
  );
  picker.addEventListener("change", () =>
    renderWallet(wallets[Number(picker.value)], weekWindow),
  );
  renderWallet(wallets[0], weekWindow);
  document
    .querySelector("#checks")
    .replaceChildren(
      ...(report.checks.ok
        ? report.checks.passed.map((text) => element("li", `✓ ${text}`))
        : [element("li", `✗ ${report.checks.error}`, "failed")]),
    );
}

const response = await fetch("/api/report");
render(await response.json());
