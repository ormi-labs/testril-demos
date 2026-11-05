const dayMs = 86400000;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "indexing-rewards",
      function_slug: "graph_network.indexing_rewards",
      chain_id: 42161,
      params: {
        rewards_manager: "0x971b9d3d0ae3eca029cab5ea1fb0f72c85e6a525",
        subgraph_service: "0xb2bb92d0de618878e438b55d5846cfecd9301105",
        staking: "0x00669a4cf01450b64e8a2a20e9b1fcb71e61ef03",
        epoch_manager: "0x5a843145c43d328b9bb7a4401d94918f131bb281",
      },
      window: untilToday(7 * dayMs),
      read: { chunk_hours: 8 },
    },
    {
      name: "delegation",
      function_slug: "graph_network.delegation",
      chain_id: 42161,
      params: {
        staking: "0x00669a4cf01450b64e8a2a20e9b1fcb71e61ef03",
        epoch_manager: "0x5a843145c43d328b9bb7a4401d94918f131bb281",
      },
      window: untilToday(7 * dayMs),
      read: { chunk_hours: 8 },
    },
    {
      name: "query-fees",
      function_slug: "graph_network.query_fees",
      chain_id: 42161,
      params: {
        staking: "0x00669a4cf01450b64e8a2a20e9b1fcb71e61ef03",
        subgraph_service: "0xb2bb92d0de618878e438b55d5846cfecd9301105",
        graph_payments: "0x7aae8ae011927bc36cb4d0d3e81f2e6e30dae06d",
        epoch_manager: "0x5a843145c43d328b9bb7a4401d94918f131bb281",
      },
      window: untilToday(7 * dayMs),
      read: { chunk_hours: 8 },
    },
  ];
}

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
const splitAmount = (row) =>
  row.kind === "rewards_collected" ? BigInt(row.amount) : 0n;
const byLog = (a, b) =>
  a.block - b.block || Number(a.log_index) - Number(b.log_index);
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

function requirePerIndexerTotals(rewards) {
  const amounts = sumBy(rewards, "indexer", splitAmount);
  const indexers = sumBy(rewards, "indexer", (row) =>
    BigInt(row.indexer_rewards),
  );
  const delegators = sumBy(rewards, "indexer", (row) =>
    BigInt(row.delegator_rewards),
  );
  const parts = (totals) => sum([...totals.values()]);
  if (parts(indexers) + parts(delegators) !== parts(amounts))
    throw new Error("Per-indexer rewards do not add up to the totals.");
  for (const [indexer, amount] of amounts)
    if (indexers.get(indexer) + delegators.get(indexer) !== amount)
      throw new Error(
        `Indexer ${indexer}: indexer plus delegator rewards do not equal ${amount}.`,
      );
  return amounts.size;
}

export function check(rows) {
  const { "indexing-rewards": rewards, delegation } = rows;
  for (const [name, list] of Object.entries(rows)) {
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
  const split = rewards.filter((row) => row.kind === "rewards_collected");
  const indexerCount = requirePerIndexerTotals(rewards);
  return [
    `Indexer plus delegator rewards equal the amount on all ${split.length} reward rows`,
    `Per-indexer rewards add up to the totals across ${indexerCount} indexers`,
    `No delegator holds more shares than their pool, on all ${delegation.length} delegation rows`,
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

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function windowDays(binds) {
  const { window } = binds.find((bind) => bind.name === "indexing-rewards");
  return {
    first: utcDay(Date.parse(window.from_time)),
    last: utcDay(Date.parse(window.to_time) - dayMs),
  };
}

export function shape(rows, binds) {
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
    window: windowDays(binds),
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
