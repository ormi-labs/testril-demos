import {
  balanceBinds,
  formatAmount,
  hoursInWindow,
  label,
  symbolOf,
  tokenBalanceBinds,
  tokens,
  transferBinds,
  transferKey,
  transferWindow,
  uniqueTransfers,
  wallets,
} from "./report.mjs";

const stEth = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const rebaseHoursUtc = new Set(["12", "13"]);
const rebaseDriftDivisor = 5000n;
const roundingWeiPerTransfer = 2n;

function checkTransferRows(rows) {
  for (const bind of transferBinds) {
    const { wallet } = bind.params;
    const seen = new Set();
    for (const row of rows[bind.name]) {
      const where = `${label(wallet)} transfer ${transferKey(row)}`;
      if (row.from !== wallet && row.to !== wallet)
        throw new Error(`${where} does not involve the wallet.`);
      if (
        row.block < transferWindow.from_block ||
        row.block >= transferWindow.to_block
      )
        throw new Error(`${where} is outside the block window.`);
      if (!tokens.includes(row.token))
        throw new Error(`${where} is a token outside the trail.`);
      if (seen.has(transferKey(row)))
        throw new Error(`${where} is listed twice.`);
      seen.add(transferKey(row));
    }
  }
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

function hourIndexOf(block, hourEndBlocks) {
  const index = hourEndBlocks.findIndex((end) => block <= end);
  if (index === -1)
    throw new Error(`Block ${block} is after the last recorded hour.`);
  return index;
}

function recordedHourEnds(hourEndBlocks) {
  const ends = hoursInWindow().map((hour) => hourEndBlocks?.[hour]);
  if (ends.some((end, index) => !(end > (ends[index - 1] ?? -1))))
    throw new Error("The recording lacks an increasing last block per hour.");
  return ends;
}

function hourlyTransferChanges(rows, hourEndBlocks) {
  const changes = new Map();
  for (const { row } of uniqueTransfers(rows).values()) {
    const hour = hourIndexOf(row.block, hourEndBlocks);
    for (const [wallet, sign] of [
      [row.to, 1n],
      [row.from, -1n],
    ]) {
      const key = `${wallet}:${row.token}:${hour}`;
      const change = changes.get(key) ?? { amount: 0n, count: 0n };
      change.amount += sign * BigInt(row.value);
      change.count += 1n;
      changes.set(key, change);
    }
  }
  return changes;
}

function allowedDrift(token, hour, balance, transfers) {
  if (token !== stEth) return 0n;
  const rebase = rebaseHoursUtc.has(hour.slice(11))
    ? balance / rebaseDriftDivisor
    : 0n;
  return rebase + roundingWeiPerTransfer * transfers;
}

function checkBalancesFollowTransfers(rows, hourEndBlocks) {
  const changes = hourlyTransferChanges(rows, hourEndBlocks);
  const hours = hoursInWindow();
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
      for (let index = 1; index < hours.length; index++) {
        const before = balances.get(`${token}:${hours[index - 1]}`) ?? 0n;
        const after = balances.get(`${token}:${hours[index]}`) ?? 0n;
        const change = changes.get(`${wallet}:${token}:${index}`) ?? {
          amount: 0n,
          count: 0n,
        };
        const drift = after - before - change.amount;
        const allowed = allowedDrift(
          token,
          hours[index],
          before > after ? before : after,
          change.count,
        );
        if (drift > allowed || -drift > allowed)
          throw new Error(
            `${label(wallet)} ${symbolOf(token)} balance moved by ${formatAmount(after - before, true)} in ${hours[index]}, but its transfers moved ${formatAmount(change.amount, true)}.`,
          );
      }
  }
}

export function check({ rows, hourEndBlocks }) {
  checkTransferRows(rows);
  checkBothSidesAgree(rows);
  checkBalancesFollowTransfers(rows, recordedHourEnds(hourEndBlocks));
  checkNativeBalances(rows);
  const entries = [...uniqueTransfers(rows).values()];
  const readTwice = entries.filter((entry) => entry.seenIn.size > 1).length;
  return [
    `${entries.length} transfers counted once each, ${readTwice} of them read from both wallets`,
    "Every transfer between two trail wallets appears, identical, on both sides",
    "Every wallet's hourly token balance changes by exactly its transfers in that hour (stETH rebase drift of up to 0.02% only in the daily report hours)",
    `Balance rows sit only in the ${hoursInWindow().length} hours of the window`,
  ];
}
