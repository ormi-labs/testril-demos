import { rawAmount } from "./amounts.js";

export function replayBalances(initial, transfers, step) {
  if (!Number.isInteger(step) || step < 0 || step > transfers.length)
    throw new Error("Invalid replay step.");
  const balances = Object.fromEntries(
    Object.entries(initial).map(([id, amount]) => [id, rawAmount(amount)]),
  );
  for (const transfer of transfers.slice(0, step)) {
    if (
      !Object.hasOwn(balances, transfer.from) ||
      !Object.hasOwn(balances, transfer.to) ||
      transfer.from === transfer.to
    )
      throw new Error("Invalid replay wallet.");
    const amount = rawAmount(transfer.amountRaw);
    if (amount === 0n || balances[transfer.from] < amount)
      throw new Error("Invalid replay amount.");
    balances[transfer.from] -= amount;
    balances[transfer.to] += amount;
  }
  return Object.fromEntries(
    Object.entries(balances).map(([id, amount]) => [id, amount.toString()]),
  );
}
