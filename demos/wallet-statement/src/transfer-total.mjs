import { decimalAtoms } from "../public/model.js";

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
    if (
      typeof transfers !== "string" ||
      transfers.length > 78 ||
      !/^(0|[1-9]\d*)$/.test(transfers) ||
      BigInt(transfers) >= 1n << 256n
    )
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

export function nansenCounterparties(text, report, page) {
  const value = JSON.parse(text, (key, value, context) => {
    if (
      !["token_in_amount", "token_out_amount"].includes(key) ||
      typeof value !== "number"
    )
      return value;
    if (!context?.source)
      throw new Error("Lossless JSON numbers are required.");
    return context.source;
  });
  const total = nansenTotal(value, report.token, page);
  const amount = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || v.startsWith("-"))
      throw new Error("Invalid token amount.");
    return decimalAtoms(v);
  };
  const rows = total.counterparties.map((row) => {
    const entry = value.data.find(
      (r) => r.counterparty_address.toLowerCase() === row.address,
    );
    const token = entry.tokens_info.find(
      (r) => r.token_address.toLowerCase() === report.token,
    );
    return {
      ...row,
      incoming: amount(token.token_in_amount),
      outgoing: amount(token.token_out_amount),
    };
  });
  return { rows, pagination: { page, last: total.last } };
}
