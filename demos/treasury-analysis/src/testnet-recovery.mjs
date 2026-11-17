// Explicit operator write-off after a testnet backend reset. This does not
// establish settlement, replay purchases, or authorize wallet transfers.
export function writeOffTestnetPayments(contents, at) {
  const state = JSON.parse(contents);
  const identity = JSON.parse(state.identity);
  if (
    identity.chain?.id !== 84532 ||
    identity.token?.address?.toLowerCase() !==
      "0x036cbd53842c5426634e7929541ec2318f3dcf7e" ||
    state.pending !== null ||
    !Array.isArray(state.receipts) ||
    !Number.isFinite(Date.parse(at))
  )
    throw new Error(
      "Write-off requires Base Sepolia USDC and no pending transfer.",
    );
  const entries = state.receipts.filter((r) =>
    ["paying", "paid"].includes(r.status),
  );
  let charge = 0n;
  let deposit = 0n;
  for (const entry of entries) {
    if (
      !["read", "materialize"].includes(entry.verb) ||
      ![entry.chargeRaw, entry.depositRaw].every(
        (value) => typeof value === "string" && /^[0-9]{1,78}$/.test(value),
      ) ||
      entry.accepted?.network !== "eip155:84532"
    )
      throw new Error(
        "The unfinished payment is not a supported testnet data purchase.",
      );
    charge += BigInt(entry.chargeRaw);
    deposit += BigInt(entry.depositRaw);
    entry.status = "abandoned";
    entry.abandonedAt = at;
    entry.abandonmentReason = "operator-testnet-writeoff";
  }
  // Keep charges/deposits against their original caps. Discard stale provider
  // bindings and evidence so cleanup must read current state from the server.
  state.functions = {};
  state.balanceEvidence = {};
  state.transferEvidence = {};
  state.refreshNeeded = true;
  delete state.refreshBlock;
  return {
    contents: JSON.stringify(state),
    payments: entries.length,
    chargeRaw: charge.toString(),
    depositRaw: deposit.toString(),
  };
}
