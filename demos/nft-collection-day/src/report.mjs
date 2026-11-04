export const binds = [
  {
    name: "metadata",
    function_slug: "erc721.collection_metadata",
    chain_id: 1,
    params: { nft_address: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8" },
    window: { from_block: 26323364, to_block: 26323365 },
  },
  {
    name: "transfers",
    function_slug: "erc721.transfer",
    chain_id: 1,
    params: { nft_address: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8" },
    window: { from_block: 26316189, to_block: 26323365 },
    read: { chunk_blocks: 1200 },
  },
  {
    name: "owners",
    function_slug: "erc721.nft_owners",
    chain_id: 1,
    params: { nft_address: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8" },
    window: { from_block: 12876179, to_block: 26323365 },
    read: { chunk_blocks: 1000000 },
  },
];

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const bindByName = Object.fromEntries(binds.map((bind) => [bind.name, bind]));
export const collection = bindByName.transfers.params.nft_address;
export const dayWindow = bindByName.transfers.window;
export const ownersWindow = bindByName.owners.window;
export const metadataWindow = bindByName.metadata.window;
export const day = "2026-11-01";
const hoursPerDay = 24;
const topHolders = 10;
const basisPoints = 10000n;

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

function ownersBeforeDay(owners) {
  const before = owners.filter((o) => o.block < dayWindow.from_block);
  return new Map([...latestOwners(before)].map(([id, row]) => [id, row.owner]));
}

function checkMints(transfers, owners) {
  const heldBefore = new Set(
    [...ownersBeforeDay(owners)]
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
  const current = ownersBeforeDay(owners);
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

export function check(rows) {
  const { transfers, owners } = rows;
  const outside = transfers.find(
    (t) => t.block < dayWindow.from_block || t.block >= dayWindow.to_block,
  );
  if (outside)
    throw new Error(`Transfer at block ${outside.block} is outside the day.`);
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

function hourly(transfers) {
  const hours = Array.from({ length: hoursPerDay }, (_, hour) => ({
    hour,
    mints: 0,
    trades: 0,
  }));
  for (const transfer of transfers) {
    const hour = Math.floor(
      ((transfer.block - dayWindow.from_block) * hoursPerDay) /
        (dayWindow.to_block - dayWindow.from_block),
    );
    if (isMint(transfer)) hours[hour].mints += 1;
    else if (!isBurn(transfer)) hours[hour].trades += 1;
  }
  return hours;
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

export function shape(rows) {
  const { transfers, owners, metadata } = rows;
  const balances = holdings(owners);
  const live = [...balances.values()].reduce((sum, n) => sum + n, 0n);
  const mints = transfers.filter(isMint).length;
  const burns = transfers.filter(isBurn).length;
  return {
    day,
    dayWindow,
    ownersWindow,
    collection,
    name: metadata[0].name,
    symbol: metadata[0].symbol,
    mints,
    burns,
    trades: transfers.length - mints - burns,
    holders: balances.size.toString(),
    liveTokens: live.toString(),
    hours: hourly(transfers),
    concentration: concentration(balances),
  };
}
