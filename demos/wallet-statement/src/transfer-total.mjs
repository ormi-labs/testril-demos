// Count only the requested token; each counterparty can list several tokens.
export function nansenTotal(value, token, page = 1) {
  const p = value?.pagination;
  if (
    p?.page !== page ||
    p.per_page !== 1000 ||
    typeof p.is_last_page !== "boolean" ||
    !Array.isArray(value.data) ||
    value.data.length > 1000
  )
    throw new Error("Invalid counterparty pagination.");
  let count = 0n;
  const counterparties = [];
  const seen = new Set();
  for (const entry of value.data) {
    const address = entry.counterparty_address?.toLowerCase();
    if (
      !/^0x[0-9a-f]{40}$/.test(address ?? "") ||
      seen.has(address) ||
      !Array.isArray(entry.tokens_info)
    )
      throw new Error("Invalid counterparty statistics.");
    seen.add(address);
    const selected = entry.tokens_info.filter(
      (t) => t.token_address?.toLowerCase() === token.toLowerCase(),
    );
    if (selected.length > 1) throw new Error("Duplicate token statistics.");
    if (!selected.length) continue;
    const transfers = selected[0].num_transfer;
    if (typeof transfers !== "string" || !/^(0|[1-9]\d*)$/.test(transfers))
      throw new Error("Invalid transfer count.");
    count += BigInt(transfers);
    counterparties.push({ address, transfers });
  }
  return {
    count: count.toString(),
    entries: value.data.length,
    counterparties,
    last: p.is_last_page,
  };
}
