import { rawAmount } from "../public/amounts.js";

export const calculationVersion = "treasury-accounting/1";
export const addressPattern = /^0x[0-9a-f]{40}$/;

export function validateInputs(input) {
  if (!input || typeof input !== "object")
    throw new Error("Inputs are required.");
  const allowed = new Set([
    "chainId",
    "treasury",
    "token",
    "decimals",
    "fromBlock",
    "toBlock",
    "team",
    "budgetRaw",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error("Unexpected input fields.");
  if (!addressPattern.test(input.treasury))
    throw new Error("Invalid treasury address.");
  if (!Number.isSafeInteger(input.chainId) || input.chainId < 1)
    throw new Error("Invalid chain ID.");
  if (!addressPattern.test(input.token))
    throw new Error("Invalid token address.");
  if (
    !Number.isSafeInteger(input.fromBlock) ||
    !Number.isSafeInteger(input.toBlock) ||
    input.fromBlock < 1 ||
    input.fromBlock >= input.toBlock
  ) {
    throw new Error(
      "Use a non-empty [from block, to block) range, starting at block 1 or later.",
    );
  }
  if (
    !Array.isArray(input.team) ||
    input.team.some((address) => !addressPattern.test(address))
  ) {
    throw new Error("Team addresses must be lowercase Ethereum addresses.");
  }
  rawAmount(input.budgetRaw);
  if (
    !Number.isInteger(input.decimals) ||
    input.decimals < 0 ||
    input.decimals > 36
  )
    throw new Error("Invalid token decimals.");
}

export function validateEdges(edges, input) {
  if (!Array.isArray(edges))
    throw new Error("Transfer edges must be an array.");
  const keys = new Set();
  for (const edge of edges) {
    if (
      !Number.isSafeInteger(edge.block) ||
      edge.block < input.fromBlock ||
      edge.block >= input.toBlock
    )
      throw new Error("Transfer outside the requested range.");
    if (!addressPattern.test(edge.from) || !addressPattern.test(edge.to))
      throw new Error("Invalid transfer address.");
    rawAmount(edge.amountRaw);
    if (rawAmount(edge.transferCount) === 0n)
      throw new Error("Transfer count must be positive.");
    const key = `${edge.block}:${edge.from}:${edge.to}`;
    if (keys.has(key)) throw new Error("Duplicate transfer edge.");
    keys.add(key);
  }
}

export function calculate(input, data) {
  validateInputs(input);
  validateEdges(data.edges, input);
  const opening = rawAmount(data.openingRaw);
  const closing = rawAmount(data.closingRaw);
  let incoming = 0n;
  let outgoing = 0n;
  let selfTransfers = 0n;
  let teamIncoming = 0n;
  let teamOutgoing = 0n;
  const team = new Set([input.treasury, ...input.team]);
  const counterparties = new Map();
  for (const edge of data.edges) {
    const amount = rawAmount(edge.amountRaw);
    if (!team.has(edge.from) && team.has(edge.to)) teamIncoming += amount;
    if (team.has(edge.from) && !team.has(edge.to)) teamOutgoing += amount;
    if (edge.from === input.treasury && edge.to === input.treasury) {
      selfTransfers += rawAmount(edge.transferCount);
      continue;
    }
    const isIncoming = edge.to === input.treasury;
    const isOutgoing = edge.from === input.treasury;
    if (!isIncoming && !isOutgoing) continue;
    if (isIncoming) incoming += amount;
    else outgoing += amount;
    const address = isIncoming ? edge.from : edge.to;
    const row = counterparties.get(address) ?? {
      address,
      incoming: 0n,
      outgoing: 0n,
      count: 0n,
    };
    row[isIncoming ? "incoming" : "outgoing"] += amount;
    row.count += rawAmount(edge.transferCount);
    counterparties.set(address, row);
  }
  const ranked = [...counterparties.values()].sort((a, b) => {
    const difference = b.incoming + b.outgoing - (a.incoming + a.outgoing);
    return difference > 0n
      ? 1
      : difference < 0n
        ? -1
        : a.address.localeCompare(b.address);
  });
  return {
    openingRaw: opening.toString(),
    closingRaw: closing.toString(),
    incomingRaw: incoming.toString(),
    outgoingRaw: outgoing.toString(),
    netRaw: (incoming - outgoing).toString(),
    reconciles: opening + incoming - outgoing === closing,
    selfTransfers: selfTransfers.toString(),
    team: {
      incomingRaw: teamIncoming.toString(),
      outgoingRaw: teamOutgoing.toString(),
      netRaw: (teamIncoming - teamOutgoing).toString(),
    },
    counterparties: ranked.map((row) => ({
      address: row.address,
      incomingRaw: row.incoming.toString(),
      outgoingRaw: row.outgoing.toString(),
      netRaw: (row.incoming - row.outgoing).toString(),
      transferCount: row.count.toString(),
      classification: team.has(row.address) ? "Team" : "External",
    })),
  };
}

export function aggregateLogs(logs) {
  const edges = new Map();
  for (const log of logs) {
    const key = `${log.block}:${log.from}:${log.to}`;
    const edge = edges.get(key) ?? {
      block: log.block,
      from: log.from,
      to: log.to,
      amount: 0n,
      count: 0n,
    };
    edge.amount += rawAmount(log.amountRaw);
    edge.count += 1n;
    edges.set(key, edge);
  }
  return [...edges.values()].map(({ amount, count, ...edge }) => ({
    ...edge,
    amountRaw: amount.toString(),
    transferCount: count.toString(),
  }));
}
