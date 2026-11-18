export const paymentNetwork = "eip155:8453";
export const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const chargeCap = "2000000";
export const depositCap = "1000000";
export const address = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
export const token = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const addr = /^0x[0-9a-f]{40}$/;
const tx = /^0x[0-9a-f]{64}$/;

export function functionSlug(method = "transactions") {
  if (!["transactions", "totals"].includes(method))
    throw new Error("Choose transfers or daily totals.");
  return method === "totals"
    ? "erc20.wallet_counterparties"
    : "erc20.wallet_transfers";
}
export function dayScope(date, now = Date.now(), method = "transactions") {
  const from =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Date.parse(`${date}T00:00:00Z`)
      : NaN;
  if (
    !Number.isFinite(from) ||
    date < "2015-07-31" ||
    new Date(from).toISOString().slice(0, 10) !== date ||
    from + 86400000 > now
  )
    throw new Error("Choose a completed UTC day.");
  return {
    window: date,
    chain_id: 1,
    decimals: 6,
    wallet: address,
    token,
    function_slug: functionSlug(method),
    from_time: new Date(from).toISOString().replace(".000Z", "Z"),
    to_time: new Date(from + 86400000).toISOString().replace(".000Z", "Z"),
  };
}
// Numeric windows are retained for the archived hourly reports.
export function scope(window = "day", method = "transactions") {
  const slug = functionSlug(method);
  if (typeof window === "string" && window !== "day")
    return dayScope(window, Date.now(), method);
  if (method === "totals" && window !== "day")
    throw new Error("Daily totals require a complete UTC day.");
  if (!["day", 12, 13].includes(window))
    throw new Error("Choose the full day or an archived hourly report.");
  const day = window === "day";
  return {
    window,
    chain_id: 1,
    decimals: 6,
    wallet: address,
    token,
    function_slug: slug,
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
    // PR 386 serves wallet-relative directions. Archived recordings and the
    // preceding production release use endpoints; normalize both to a ledger.
    let from = r.from,
      to = r.to;
    if (provider === "testril" && r.direction !== undefined) {
      const counterparty = r.counterparty?.toLowerCase();
      if (
        !["in", "out", "self"].includes(r.direction) ||
        !addr.test(counterparty ?? "") ||
        (r.direction === "self") !== (counterparty === report.wallet)
      )
        throw new Error("Invalid transfer direction.");
      from = r.direction === "in" ? counterparty : report.wallet;
      to = r.direction === "out" ? counterparty : report.wallet;
      if (
        (r.from !== undefined && r.from.toLowerCase() !== from) ||
        (r.to !== undefined && r.to.toLowerCase() !== to)
      )
        throw new Error("Conflicting transfer endpoints.");
    }
    const row = {
      tx: r.tx?.toLowerCase(),
      token: r.token?.toLowerCase(),
      from: from?.toLowerCase(),
      to: to?.toLowerCase(),
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
    if (row.to === wallet && row.from !== wallet) incoming += amount;
    if (row.from === wallet && row.to !== wallet) outgoing += amount;
    const other = row.from === wallet ? row.to : row.from;
    const p = partners.get(other) ?? {
      address: other,
      transfers: 0,
      incoming: 0n,
      outgoing: 0n,
    };
    p.transfers++;
    if (row.to === wallet && row.from !== wallet) p.incoming += amount;
    if (row.from === wallet && row.to !== wallet) p.outgoing += amount;
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
export function validateCounterparties(rows, report) {
  if (!Array.isArray(rows) || rows.length > maxRows)
    throw new Error("Invalid daily totals.");
  const seen = new Set();
  return rows.map((r) => {
    const address = r.counterparty?.toLowerCase();
    if (
      !addr.test(address ?? "") ||
      seen.has(address) ||
      r.token?.toLowerCase() !== report.token ||
      r.day !== report.from_time.slice(0, 10) ||
      atoms(r.transfers) === 0n ||
      atoms(r.transfers) >= 1n << 256n ||
      atoms(r.received) >= 1n << 256n ||
      atoms(r.sent) >= 1n << 256n ||
      (address === report.wallet && (r.received !== "0" || r.sent !== "0"))
    )
      throw new Error("Invalid counterparty total.");
    seen.add(address);
    return {
      address,
      transfers: r.transfers,
      incoming: r.received,
      outgoing: r.sent,
    };
  });
}
export function transferCount(rows, method = "transactions") {
  return method === "totals"
    ? rows.reduce((total, r) => total + atoms(r.transfers), 0n).toString()
    : String(rows.length);
}
export function compareCounterparties(left, right) {
  const sorted = (rows) =>
    [...rows].sort((a, b) => a.address.localeCompare(b.address));
  const a = sorted(left),
    b = sorted(right);
  const countsMatch =
    a.length === b.length &&
    a.every(
      (r, i) => r.address === b[i].address && r.transfers === b[i].transfers,
    );
  const amountsAvailable = [...a, ...b].every(
    (r) => r.incoming !== null && r.outgoing !== null,
  );
  const amountsMatch = amountsAvailable
    ? countsMatch &&
      a.every(
        (r, i) => r.incoming === b[i].incoming && r.outgoing === b[i].outgoing,
      )
    : null;
  return {
    matches: countsMatch && amountsMatch !== false,
    countsMatch,
    amountsMatch,
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
