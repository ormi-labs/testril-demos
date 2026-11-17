export const paymentNetwork = "eip155:8453";
export const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const chargeCap = "2000000";
export const depositCap = "1000000";
export const address = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
export const token = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const addr = /^0x[0-9a-f]{40}$/;
const tx = /^0x[0-9a-f]{64}$/;

// Numeric windows are retained for the archived hourly reports.
export function scope(window = "day") {
  if (!["day", 12, 13].includes(window))
    throw new Error("Choose the full day or an archived hourly report.");
  const day = window === "day";
  return {
    window,
    chain_id: 1,
    decimals: 6,
    wallet: address,
    token,
    function_slug: "erc20.wallet_transfers",
    from_time: day ? "2026-11-10T00:00:00Z" : `2026-11-10T${window}:00:00Z`,
    to_time: day ? "2026-11-11T00:00:00Z" : `2026-11-10T${window + 1}:00:00Z`,
    from_block: day ? 26380784 : window === 12 ? 26384371 : 26384670,
    to_block: day ? 26387957 : window === 12 ? 26384670 : 26384969,
  };
}
export const maxRows = 20000;
export const maxPages = 100;
export function atoms(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
    throw new Error("Expected an exact integer amount.");
  return BigInt(value);
}
export function decimal(value, places = 6) {
  const s = atoms(value)
    .toString()
    .padStart(places + 1, "0");
  return `${s.slice(0, -places)}.${s.slice(-places)}`;
}
export function decimalAtoms(value) {
  const m =
    typeof value === "string" &&
    value.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!m || value.length > 120) throw new Error("Invalid decimal amount.");
  const shift = 6 + Number(m[4] ?? 0) - (m[3]?.length ?? 0);
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 100)
    throw new Error("Amount exceeds supported precision.");
  let raw = BigInt(m[2] + (m[3] ?? ""));
  if (shift >= 0) raw *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    if (raw % divisor)
      throw new Error("USDC amount has more than six decimal places.");
    raw /= divisor;
  }
  if (raw >= 1n << 256n) throw new Error("Amount exceeds uint256.");
  return raw.toString();
}
export function validateRows(rows, report, provider) {
  if (!Array.isArray(rows) || rows.length > maxRows)
    throw new Error("Invalid transfer list.");
  return rows.map((r) => {
    const row = {
      tx: r.tx?.toLowerCase(),
      token: r.token?.toLowerCase(),
      from: r.from?.toLowerCase(),
      to: r.to?.toLowerCase(),
      value: r.value,
    };
    if (
      !tx.test(row.tx) ||
      !addr.test(row.from) ||
      !addr.test(row.to) ||
      row.token !== report.token ||
      (row.from !== report.wallet && row.to !== report.wallet)
    )
      throw new Error("A transfer has a different scope.");
    atoms(row.value);
    if (provider === "testril") {
      if (
        !Number.isSafeInteger(r.block) ||
        r.block < report.from_block ||
        r.block >= report.to_block ||
        !/^(0|[1-9]\d*)$/.test(r.log_index)
      )
        throw new Error("A transfer has an invalid source position.");
      Object.assign(row, { block: r.block, log_index: r.log_index });
    }
    return row;
  });
}
export function summary(rows, wallet = address) {
  let incoming = 0n,
    outgoing = 0n;
  const partners = new Map();
  for (const row of rows) {
    const amount = atoms(row.value);
    if (row.to === wallet) incoming += amount;
    if (row.from === wallet) outgoing += amount;
    const other = row.from === wallet ? row.to : row.from;
    const p = partners.get(other) ?? {
      address: other,
      transfers: 0,
      incoming: 0n,
      outgoing: 0n,
    };
    p.transfers++;
    if (row.to === wallet) p.incoming += amount;
    if (row.from === wallet) p.outgoing += amount;
    partners.set(other, p);
  }
  return {
    transfers: rows.length,
    incoming: incoming.toString(),
    outgoing: outgoing.toString(),
    counterparties: [...partners.values()]
      .sort((a, b) =>
        a.incoming + a.outgoing > b.incoming + b.outgoing ? -1 : 1,
      )
      .map((p) => ({
        ...p,
        incoming: p.incoming.toString(),
        outgoing: p.outgoing.toString(),
      })),
  };
}
export function compare(left, right) {
  const key = (r) => [r.tx, r.from, r.to, r.value].join(":");
  const a = left.map(key).sort(),
    b = right.map(key).sort();
  return {
    matches: a.length === b.length && a.every((v, i) => v === b[i]),
    left: a.length,
    right: b.length,
  };
}
export function evidenceCosts(payments, phase) {
  const selected = payments.filter((p) => p.phase === phase);
  return {
    amount: selected.reduce((s, p) => s + atoms(p.amount), 0n).toString(),
    confirmed: selected.every((p) => p.confirmed),
  };
}
