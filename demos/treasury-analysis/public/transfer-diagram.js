import { decimalAmount } from "./amounts.js";

function svgNode(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
const pair = (transfer) => [transfer.from, transfer.to].sort().join(":");
const slots = {
  a: { x: 20, center: 105 },
  treasury: { x: 415, center: 500 },
  b: { x: 810, center: 895 },
};

// One shared set of wallets. Separate lanes keep each event selectable, including
// repeated transfers between the same pair; amounts are never aggregated.
export function transferDiagram({
  wallets,
  balances,
  transfers,
  visibleCount,
  selected,
  onSelect,
}) {
  const groups = new Map([
    ["a:treasury", []],
    ["b:treasury", []],
    ["a:b", []],
  ]);
  transfers.forEach((transfer, index) =>
    groups.get(pair(transfer)).push({ transfer, index }),
  );
  const sideRows = Math.max(
    groups.get("a:treasury").length,
    groups.get("b:treasury").length,
    1,
  );
  const sideHeight = sideRows * 100;
  const middle = 32 + sideHeight / 2;
  const height = sideHeight + 80 + groups.get("a:b").length * 100;
  const svg = svgNode("svg", {
    viewBox: `0 0 1000 ${height}`,
    class: "transfer-diagram",
    role: "group",
    "aria-label":
      "Transfer diagram: Counterparty A, Treasury, and Counterparty B",
  });
  svg.append(svgNode("title", {}, "Transfers between the three wallets"));

  for (const entries of groups.values())
    entries.forEach(({ transfer, index }, lane) => {
      if (index >= visibleCount) return;
      const across = pair(transfer) === "a:b";
      const left = pair(transfer) === "a:treasury";
      const y = across ? sideHeight + 100 + lane * 100 : 82 + lane * 100;
      const source = slots[transfer.from];
      const destination = slots[transfer.to];
      let path;
      let labelX;
      let arrowX;
      let direction;
      if (across) {
        path = `M ${source.center} ${middle + 46} V ${y} H ${destination.center} V ${middle + 46}`;
        labelX = 395;
        arrowX = (source.center + destination.center) / 2;
        direction = destination.center > source.center ? 1 : -1;
      } else {
        const rightward = destination.center > source.center;
        const start = source.x + (rightward ? 170 : 0);
        const end = destination.x + (rightward ? 0 : 170);
        const startRail = start + (rightward ? 14 : -14);
        const endRail = end + (rightward ? -14 : 14);
        path = `M ${start} ${middle} H ${startRail} V ${y} H ${endRail} V ${middle} H ${end}`;
        labelX = left ? 197 : 592;
        arrowX = left ? 302 : 697;
        direction = rightward ? 1 : -1;
      }
      const group = svgNode("g", {
        class: `transfer-edge${selected === transfer.id ? " selected" : ""}`,
      });
      group.append(
        svgNode("path", { d: path, class: "diagram-line" }),
        svgNode("path", {
          d: `M ${arrowX - direction * 8} ${y - 6} L ${arrowX + direction * 4} ${y} L ${arrowX - direction * 8} ${y + 6} Z`,
          class: "diagram-arrow",
        }),
      );
      const label = svgNode("foreignObject", {
        x: labelX,
        y: y - 62,
        width: 210,
        height: 96,
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "diagram-transfer";
      button.dataset.transfer = transfer.id;
      const from = wallets.find((wallet) => wallet.id === transfer.from).name;
      const to = wallets.find((wallet) => wallet.id === transfer.to).name;
      button.setAttribute(
        "aria-label",
        `Transfer ${index + 1}: ${from} to ${to}, ${decimalAmount(transfer.amountRaw)} USDC. Show provenance.`,
      );
      const amount = document.createElement("span");
      amount.className = "diagram-amount";
      amount.textContent = `${index + 1}. ${decimalAmount(transfer.amountRaw)} USDC`;
      const timestamp = document.createElement("span");
      timestamp.className = "diagram-time";
      timestamp.textContent = `${new Date(transfer.timestamp).toISOString().slice(11, 19)} UTC`;
      const block = document.createElement("span");
      block.className = "diagram-block";
      block.textContent = `Block ${transfer.block}`;
      button.append(amount, timestamp, block);
      button.addEventListener("click", () => onSelect(transfer));
      label.append(button);
      group.append(label);
      // Lines outside the label are clickable too; keyboard users use the button.
      group.addEventListener("click", (event) => {
        if (event.target instanceof SVGElement) onSelect(transfer);
      });
      svg.append(group);
    });

  for (const wallet of wallets) {
    const { x } = slots[wallet.id];
    const node = svgNode("g", {
      class: `diagram-wallet${wallet.id === "treasury" ? " treasury-node" : ""}`,
      "data-wallet": wallet.id,
    });
    node.append(
      svgNode("rect", { x, y: middle - 46, width: 170, height: 92, rx: 5 }),
      svgNode(
        "text",
        {
          x: x + 85,
          y: middle - 14,
          "text-anchor": "middle",
          class: "diagram-wallet-name",
        },
        wallet.name,
      ),
      svgNode(
        "text",
        {
          x: x + 85,
          y: middle + 17,
          "text-anchor": "middle",
          class: "diagram-wallet-balance",
        },
        `${decimalAmount(balances[wallet.id])} USDC`,
      ),
    );
    svg.append(node);
  }
  return svg;
}
