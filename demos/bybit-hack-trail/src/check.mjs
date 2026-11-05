import {
  balanceBinds,
  formatAmount,
  hoursInWindow,
  label,
  segments,
  symbolOf,
  tokenBalanceBinds,
  tokens,
  transferBinds,
  transferKey,
  transfersOfWallet,
  uniqueTransfers,
  walletKeys,
  wallets,
} from "./report.mjs";

const stEth = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const rebaseDriftDivisor = 5000n;
const roundingWeiPerTransfer = 2n;

function checkTransferRows(rows) {
  walletKeys.forEach((key, index) => {
    const wallet = wallets[index];
    const seen = new Set();
    for (const row of transfersOfWallet(rows, key)) {
      const where = `${label(wallet)} transfer ${transferKey(row)}`;
      if (row.from !== wallet && row.to !== wallet)
        throw new Error(`${where} does not involve the wallet.`);
      if (!tokens.includes(row.token))
        throw new Error(`${where} is a token outside the trail.`);
      if (seen.has(transferKey(row)))
        throw new Error(`${where} is listed twice.`);
      seen.add(transferKey(row));
    }
  });
}

function checkBothSidesAgree(rows) {
  const first = new Map();
  for (const bind of transferBinds)
    for (const row of rows[bind.name]) {
      const key = transferKey(row);
      const other = first.get(key);
      const fields = ["from", "to", "token", "value"];
      if (other && fields.some((field) => other[field] !== row[field]))
        throw new Error(`Wallets disagree about transfer ${key}.`);
      first.set(key, row);
    }
  for (const [key, { row, seenIn }] of uniqueTransfers(rows))
    for (const side of [row.from, row.to])
      if (wallets.includes(side) && !seenIn.has(side))
        throw new Error(`Transfer ${key} is missing from ${label(side)}.`);
}

function checkHourRows(rows, bind, owner) {
  const hours = new Set(hoursInWindow());
  const seen = new Set();
  for (const row of rows[bind.name]) {
    const key = `${row.hour}:${row.token ?? ""}`;
    const tokenOutside = row.token !== undefined && !tokens.includes(row.token);
    const wrongOwner = row.owner !== undefined && row.owner !== owner;
    if (wrongOwner || tokenOutside || !hours.has(row.hour) || seen.has(key))
      throw new Error(`${bind.name} has a stray or repeated ${row.hour} row.`);
    seen.add(key);
  }
}

function checkNativeBalances(rows) {
  for (const bind of balanceBinds)
    checkHourRows(rows, bind, bind.params.owners[0]);
}

function segmentTransferChanges(rows) {
  const changes = new Map();
  transferBinds.forEach((bind) => {
    const segment = segments.findIndex((s) => bind.name.endsWith(s.key));
    for (const row of rows[bind.name]) {
      const wallet = bind.params.wallet;
      const sign = row.to === wallet ? 1n : row.from === wallet ? -1n : 0n;
      if (row.from === row.to) continue;
      const key = `${wallet}:${row.token}:${segment}`;
      const change = changes.get(key) ?? { amount: 0n, count: 0n };
      change.amount += sign * BigInt(row.value);
      change.count += 1n;
      changes.set(key, change);
    }
  });
  return changes;
}

function allowedDrift(token, segment, balance, transfers) {
  if (token !== stEth) return 0n;
  const rebase = segment.holdsRebase ? balance / rebaseDriftDivisor : 0n;
  return rebase + roundingWeiPerTransfer * transfers;
}

function checkBalancesFollowTransfers(rows) {
  const changes = segmentTransferChanges(rows);
  for (const bind of tokenBalanceBinds) {
    const [wallet] = bind.params.reads.owners;
    checkHourRows(rows, bind, wallet);
    const balances = new Map(
      rows[bind.name].map((row) => [
        `${row.token}:${row.hour}`,
        BigInt(row.balance),
      ]),
    );
    for (const token of tokens)
      for (let index = 1; index < segments.length; index++) {
        const before =
          balances.get(`${token}:${segments[index - 1].lastHour}`) ?? 0n;
        const after =
          balances.get(`${token}:${segments[index].lastHour}`) ?? 0n;
        const change = changes.get(`${wallet}:${token}:${index}`) ?? {
          amount: 0n,
          count: 0n,
        };
        const drift = after - before - change.amount;
        const allowed = allowedDrift(
          token,
          segments[index],
          before > after ? before : after,
          change.count,
        );
        if (drift > allowed || -drift > allowed)
          throw new Error(
            `${label(wallet)} ${symbolOf(token)} balance moved by ${formatAmount(after - before, true)} to ${segments[index].lastHour}, but its transfers moved ${formatAmount(change.amount, true)}.`,
          );
      }
  }
}

export function check({ rows }) {
  checkTransferRows(rows);
  checkBothSidesAgree(rows);
  checkBalancesFollowTransfers(rows);
  checkNativeBalances(rows);
  const entries = [...uniqueTransfers(rows).values()];
  const readTwice = entries.filter((entry) => entry.seenIn.size > 1).length;
  return [
    `${entries.length} transfers counted once each, ${readTwice} of them read from both wallets`,
    "Every transfer between two trail wallets appears, identical, on both sides",
    "Every wallet's token balance changes between the ends of consecutive transfer segments by exactly its transfers in the segment (stETH rebase drift of up to 0.02% only in the segment holding the 12:00 and 13:00 UTC hours)",
    `Balance rows sit only in the ${hoursInWindow().length} hours of the window`,
  ];
}
