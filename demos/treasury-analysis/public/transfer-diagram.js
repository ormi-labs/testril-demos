import { decimalAmount } from "./amounts.js";

function svgNode(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
const slots = {
  a: { x: 20, center: 105 },
  treasury: { x: 415, center: 500 },
  b: { x: 810, center: 895 },
};

// Wallets stay in fixed columns. Each transfer gets one chronological row,
// including transfers between counterparties and repeated or reverse transfers.
export function transferDiagram({
  wallets,
  balances,
  transfers,
  visibleCount,
  selected,
  onSelect,
}) {
  const middle = 54;
  const height = 120 + visibleCount * 110;
  const svg = svgNode("svg", {
    viewBox: `0 0 1000 ${height}`,
    class: "transfer-diagram",
    role: "group",
    "aria-label":
      "Transfer diagram: Counterparty A, Treasury, and Counterparty B",
  });
  svg.append(svgNode("title", {}, "Transfers between the three wallets"));

  for (const wallet of wallets) {
    svg.append(
      svgNode("path", {
        d: `M ${slots[wallet.id].center} 100 V ${height - 12}`,
        class: "diagram-lifeline",
      }),
    );
  }

  transfers.slice(0, visibleCount).forEach((transfer, index) => {
    const y = 182 + index * 110;
    const start = slots[transfer.from].center;
    const end = slots[transfer.to].center;
    const direction = end > start ? 1 : -1;
    const labelX = (start + end) / 2 - 105;
    const group = svgNode("g", {
      class: `transfer-edge diagram-row${selected === transfer.id ? " selected" : ""}`,
    });
    group.append(
      svgNode("rect", {
        x: 8,
        y: y - 66,
        width: 984,
        height: 104,
        rx: 5,
        class: "diagram-row-background",
      }),
      svgNode("path", { d: `M 20 ${y + 42} H 980`, class: "diagram-row-rule" }),
      svgNode("path", {
        d: `M ${start} ${y} H ${end - direction * 8}`,
        class: "diagram-line",
      }),
      svgNode("circle", { cx: start, cy: y, r: 3, class: "diagram-arrow" }),
      svgNode("path", {
        d: `M ${end - direction * 12} ${y - 6} L ${end} ${y} L ${end - direction * 12} ${y + 6} Z`,
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
