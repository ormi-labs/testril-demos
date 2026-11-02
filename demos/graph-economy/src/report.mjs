import spec from "../testril.json" with { type: "json" };

const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const rewardWindow = binds["indexing-rewards"].window;
const topIndexerCount = 10;
const wei = 10n ** 18n;

const logKey = (row) => `${row.tx}:${row.log_index}`;
const sum = (values) => values.reduce((total, value) => total + value, 0n);
const sumBy = (rows, key, value) => {
  const totals = new Map();
  for (const row of rows)
    totals.set(row[key], (totals.get(row[key]) ?? 0n) + value(row));
  return totals;
};
const byLog = (a, b) =>
  a.block - b.block || Number(a.log_index) - Number(b.log_index);
const inWindow = (row, { from_block, to_block }) =>
  row.block >= from_block && row.block < to_block;

function requireInWindow(name, rows) {
  const outside = rows.find((row) => !inWindow(row, binds[name].window));
  if (outside)
    throw new Error(
      `${name} row at block ${outside.block} is outside the window.`,
    );
}

function requireUniqueLogs(name, rows) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(logKey(row)))
      throw new Error(`${name} has log ${logKey(row)} twice.`);
    seen.add(logKey(row));
  }
}

function requireRewardSplit(rewards) {
  for (const row of rewards) {
    const split = BigInt(row.indexer_rewards) + BigInt(row.delegator_rewards);
    const expected = row.kind === "rewards_collected" ? BigInt(row.amount) : 0n;
    if (split !== expected)
      throw new Error(
        `${row.kind} at block ${row.block}: indexer ${row.indexer_rewards} + delegator ${row.delegator_rewards} is ${split}, expected ${expected}.`,
      );
  }
}

export function check(rows) {
  const { "indexing-rewards": rewards, delegation, "query-fees": fees } = rows;
  for (const [name, list] of Object.entries(rows)) {
    requireInWindow(name, list);
    requireUniqueLogs(name, list);
  }
  requireRewardSplit(rewards);
  const overdrawn = delegation.find(
    (row) => BigInt(row.delegator_shares) > BigInt(row.pool_shares),
  );
  if (overdrawn)
    throw new Error(
      `Delegator holds ${overdrawn.delegator_shares} shares of a pool with ${overdrawn.pool_shares} at block ${overdrawn.block}.`,
    );
  const unbalanced = fees.find(
    (row) =>
      row.kind !== "payment_collected" &&
      BigInt(row.total) !==
        BigInt(row.indexer_fees) +
          BigInt(row.curator_fees) +
          BigInt(row.protocol_tax),
  );
  if (unbalanced)
    throw new Error(
      `Query fee ${unbalanced.kind} at block ${unbalanced.block}: indexer, curator and tax do not add up to ${unbalanced.total}.`,
    );
  const split = rewards.filter((row) => row.kind === "rewards_collected");
  const balanced = fees.filter((row) => row.kind !== "payment_collected");
  return [
    `Indexer plus delegator rewards equal the amount on all ${split.length} reward rows`,
    `No delegator holds more shares than their pool, on all ${delegation.length} delegation rows`,
    `Indexer, curator and tax fees equal the total on ${balanced.length} query fee rows`,
  ];
}

const twoDigits = (value) => String(value).padStart(2, "0");

export function formatGrt(raw, signed = false) {
  const negative = raw < 0n;
  const grt = (negative ? -raw : raw) / wei;
  const [divisor, suffix] =
    grt >= 1_000_000_000n
      ? [1_000_000_000n, "B"]
      : grt >= 1_000_000n
        ? [1_000_000n, "M"]
        : grt >= 1_000n
          ? [1_000n, "K"]
          : [1n, ""];
  const hundredths = (grt * 100n) / divisor;
  const sign = negative ? "−" : signed ? "+" : "";
  return `${sign}${hundredths / 100n}.${twoDigits(hundredths % 100n)}${suffix} GRT`;
}

export function formatPercent(part, whole) {
  if (whole === 0n) return "—";
  const hundredths = (part * 10000n) / whole;
  return `${hundredths / 100n}.${twoDigits(hundredths % 100n)}%`;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const thousandsOfGrt = (raw) => Number(raw / wei) / 1000;

const splitAmount = (row) =>
  row.kind === "rewards_collected" ? BigInt(row.amount) : 0n;

function delegationPools(delegation) {
  const pools = new Map();
  for (const row of [...delegation].sort(byLog))
    pools.set(row.indexer, BigInt(row.pool_tokens));
  return pools;
}

function topIndexers(rewards, delegation) {
  const amounts = sumBy(rewards, "indexer", (row) => BigInt(row.amount));
  const splitAmounts = sumBy(rewards, "indexer", splitAmount);
  const delegators = sumBy(rewards, "indexer", (row) =>
    BigInt(row.delegator_rewards),
  );
  const pools = delegationPools(delegation);
  return [...amounts]
    .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
    .slice(0, topIndexerCount)
    .map(([address, amount], index) => {
      const pool = pools.get(address);
      return {
        rank: index + 1,
        address,
        label: shortAddress(address),
        rewards: formatGrt(amount),
        delegatorRewards: formatGrt(delegators.get(address)),
        delegatorShare: formatPercent(
          delegators.get(address),
          splitAmounts.get(address),
        ),
        pool: pool === undefined ? "—" : formatGrt(pool),
        delegatorYield:
          pool === undefined
            ? "—"
            : formatPercent(delegators.get(address), pool),
      };
    });
}

function feesPerEpoch(fees) {
  const totals = sumBy(fees, "epoch", (row) => BigInt(row.total));
  return [...totals]
    .sort(([a], [b]) => Number(BigInt(a) - BigInt(b)))
    .map(([epoch, total]) => ({
      epoch,
      total: formatGrt(total),
      thousands: thousandsOfGrt(total),
    }));
}

export function shape(rows) {
  const { "indexing-rewards": rewards, delegation, "query-fees": fees } = rows;
  const total = sum(rewards.map((row) => BigInt(row.amount)));
  const delegatorTotal = sum(
    rewards.map((row) => BigInt(row.delegator_rewards)),
  );
  const net = sum(
    delegation.map((row) =>
      row.kind === "delegated" ? BigInt(row.tokens) : -BigInt(row.tokens),
    ),
  );
  const feeTotal = sum(fees.map((row) => BigInt(row.total)));
  const epochs = feesPerEpoch(fees);
  return {
    window: rewardWindow,
    epochs: { first: epochs[0].epoch, last: epochs.at(-1).epoch },
    rewards: formatGrt(total),
    delegatorShare: formatPercent(
      delegatorTotal,
      sum(rewards.map(splitAmount)),
    ),
    netDelegation: formatGrt(net, true),
    queryFees: formatGrt(feeTotal),
    indexers: topIndexers(rewards, delegation),
    queryFeesPerEpoch: epochs,
  };
}
