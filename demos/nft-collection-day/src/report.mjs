const dayMs = 86400000;
const hourMs = 3600000;
const hoursPerDay = 24;
const metadataLookbackMs = 5 * 60000;
const collectionBornAt = "2021-07-22T12:26:01Z";
const ownersChunkHours = 2400;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
export const collection = "0xbd3531da5cf5857e7cfaa92426877b022e612cf8";
export const zeroAddress = "0x0000000000000000000000000000000000000000";

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const between = (from, to) => ({
    from_time: isoSecond(from),
    to_time: isoSecond(to),
  });
  const yesterday = today - dayMs;
  return [
    {
      name: "metadata",
      function_slug: "erc721.collection_metadata",
      chain_id: 1,
      params: { nft_address: collection },
      window: between(today - metadataLookbackMs, today),
    },
    ...Array.from({ length: hoursPerDay }, (_, hour) => ({
      name: `transfers-${String(hour).padStart(2, "0")}`,
      function_slug: "erc721.transfer",
      chain_id: 1,
      params: { nft_address: collection },
      window: between(
        yesterday + hour * hourMs,
        yesterday + (hour + 1) * hourMs,
      ),
    })),
    {
      name: "owners",
      function_slug: "erc721.nft_owners",
      chain_id: 1,
      params: { nft_address: collection },
      window: { from_time: collectionBornAt, to_time: isoSecond(today) },
      read: { chunk_hours: ownersChunkHours },
    },
  ];
}

const topHolders = 10;
const basisPoints = 10000n;

export const transferBinds = (binds) =>
  binds.filter((bind) => bind.name.startsWith("transfers-"));
export const dayOf = (binds) =>
  transferBinds(binds)[0].window.from_time.slice(0, 10);
const transfersOf = (rows, binds) =>
  transferBinds(binds).flatMap((bind) => rows[bind.name]);

const isMint = (transfer) => transfer.from === zeroAddress;
const isBurn = (transfer) => transfer.to === zeroAddress;
const inLogOrder = (transfers) =>
  [...transfers].sort(
    (a, b) =>
      a.block - b.block || (BigInt(a.log_index) < BigInt(b.log_index) ? -1 : 1),
  );

function latestOwners(owners) {
  const latest = new Map();
  for (const row of owners) {
    const known = latest.get(row.token_id);
    if (!known || known.block <= row.block) latest.set(row.token_id, row);
  }
  return latest;
}

export function holdings(owners) {
  const balances = new Map();
  for (const { owner } of latestOwners(owners).values())
    if (owner !== zeroAddress)
      balances.set(owner, (balances.get(owner) ?? 0n) + 1n);
  return balances;
}

function ownersBeforeDay(owners, transfers) {
  const onTheDay = new Set(transfers.map((t) => `${t.token_id}@${t.block}`));
  const before = owners.filter(
    (o) => !onTheDay.has(`${o.token_id}@${o.block}`),
  );
  return new Map([...latestOwners(before)].map(([id, row]) => [id, row.owner]));
}

function checkMints(transfers, owners) {
  const heldBefore = new Set(
    [...ownersBeforeDay(owners, transfers)]
      .filter(([, owner]) => owner !== zeroAddress)
      .map(([id]) => id),
  );
  const moved = new Set();
  for (const transfer of inLogOrder(transfers)) {
    const id = transfer.token_id;
    if (isMint(transfer) && heldBefore.has(id))
      throw new Error(
        `Token ${id} was minted on the day but already had an owner before it.`,
      );
    if (!heldBefore.has(id) && !moved.has(id) && !isMint(transfer))
      throw new Error(
        `Token ${id} had no owner before the day but first moved from ${transfer.from}, not the zero address.`,
      );
    moved.add(id);
  }
  return transfers.filter(isMint).length;
}

function checkOwnersAtTransfers(transfers, owners) {
  const lastTransfers = new Map();
  for (const transfer of inLogOrder(transfers))
    lastTransfers.set(`${transfer.token_id}@${transfer.block}`, transfer);
  const rowsByTokenBlock = new Map();
  for (const row of owners) {
    const key = `${row.token_id}@${row.block}`;
    rowsByTokenBlock.set(key, [...(rowsByTokenBlock.get(key) ?? []), row]);
  }
  for (const [key, { token_id, block, to }] of lastTransfers) {
    const rows = rowsByTokenBlock.get(key) ?? [];
    if (rows.length !== 1)
      throw new Error(
        `Token ${token_id} has ${rows.length} owner rows at block ${block}, expected one.`,
      );
    if (rows[0].owner !== to)
      throw new Error(
        `Token ${token_id} at block ${block} is owned by ${rows[0].owner}, but its last transfer went to ${to}.`,
      );
  }
  return lastTransfers.size;
}

function replayHoldings(transfers, owners) {
  const current = ownersBeforeDay(owners, transfers);
  for (const transfer of inLogOrder(transfers)) {
    const owner = current.get(transfer.token_id) ?? zeroAddress;
    if (transfer.from !== owner)
      throw new Error(
        `Token ${transfer.token_id} moved from ${transfer.from} at block ${transfer.block}, but its owner was ${owner}.`,
      );
    current.set(transfer.token_id, transfer.to);
  }
  const balances = new Map();
  for (const owner of current.values())
    if (owner !== zeroAddress)
      balances.set(owner, (balances.get(owner) ?? 0n) + 1n);
  return balances;
}

function checkHolders(transfers, owners) {
  const replayed = replayHoldings(transfers, owners);
  const balances = holdings(owners);
  const held = [...balances.values()].reduce((sum, n) => sum + n, 0n);
  const differs =
    replayed.size !== balances.size ||
    [...replayed].some(([owner, n]) => balances.get(owner) !== n);
  if (differs)
    throw new Error(
      `Replaying the day's transfers gives ${replayed.size} holders, but the owner rows give ${balances.size} holders owning ${held} tokens.`,
    );
  return { holders: balances.size, held };
}

export function check(rows, binds) {
  const { owners } = rows;
  const transfers = transfersOf(rows, binds);
  const day = dayOf(binds);
  const mints = checkMints(transfers, owners);
  const tokenBlocks = checkOwnersAtTransfers(transfers, owners);
  const { holders, held } = checkHolders(transfers, owners);
  return [
    `All ${mints} mints on ${day} come from the zero address, and only for tokens with no earlier owner`,
    `${tokenBlocks} transferred token-blocks each have exactly one owner row naming the receiver of the block's last transfer`,
    `${holders} holders own ${held} live tokens, matching a replay of the day's transfers from the owners before it`,
  ];
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const shareInBasisPoints = (part, whole) => (part * basisPoints) / whole;

function percent(hundredths) {
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}%`;
}

function hourly(rows, binds) {
  return transferBinds(binds).map((bind, hour) => {
    const transfers = rows[bind.name];
    return {
      hour,
      mints: transfers.filter(isMint).length,
      trades: transfers.filter((t) => !isMint(t) && !isBurn(t)).length,
    };
  });
}

function concentration(balances) {
  const total = [...balances.values()].reduce((sum, n) => sum + n, 0n);
  const sorted = [...balances.entries()].sort((a, b) =>
    b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0,
  );
  const top = sorted.slice(0, topHolders);
  const topTotal = top.reduce((sum, [, n]) => sum + n, 0n);
  const topBp = shareInBasisPoints(topTotal, total);
  return {
    top: top.map(([address, tokens]) => ({
      address: shortAddress(address),
      tokens: tokens.toString(),
      share: percent(shareInBasisPoints(tokens, total)),
      fraction: Number(tokens) / Number(total),
    })),
    topShare: percent(topBp),
    restShare: percent(basisPoints - topBp),
    restFraction: Number(total - topTotal) / Number(total),
  };
}

export function shape(rows, binds) {
  const { owners, metadata } = rows;
  const transfers = transfersOf(rows, binds);
  const balances = holdings(owners);
  const live = [...balances.values()].reduce((sum, n) => sum + n, 0n);
  const mints = transfers.filter(isMint).length;
  const burns = transfers.filter(isBurn).length;
  return {
    day: dayOf(binds),
    ownersSince: collectionBornAt.slice(0, 10),
    collection,
    name: metadata[0].name,
    symbol: metadata[0].symbol,
    mints,
    burns,
    trades: transfers.length - mints - burns,
    holders: balances.size.toString(),
    liveTokens: live.toString(),
    hours: hourly(rows, binds),
    concentration: concentration(balances),
  };
}
