import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const collection = binds.transfers.params.nft_address;
export const dayWindow = binds.transfers.window;
export const ownersWindow = binds.owners.window;
export const metadataWindow = binds.metadata.window;
export const day = "2026-11-01";
export const hourBlocks = 300;
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

function checkMints(transfers, owners) {
  const heldBefore = new Set(
    owners.filter((o) => o.block < dayWindow.from_block).map((o) => o.token_id),
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
  const receivers = new Map();
  for (const transfer of inLogOrder(transfers))
    receivers.set(`${transfer.token_id}@${transfer.block}`, transfer.to);
  for (const [key, receiver] of receivers) {
    const [id, block] = key.split("@");
    const rows = owners.filter(
      (o) => o.token_id === id && o.block === Number(block),
    );
    if (rows.length !== 1)
      throw new Error(
        `Token ${id} has ${rows.length} owner rows at block ${block}, expected one.`,
      );
    if (rows[0].owner !== receiver)
      throw new Error(
        `Token ${id} at block ${block} is owned by ${rows[0].owner}, but its last transfer went to ${receiver}.`,
      );
  }
  return receivers.size;
}

function checkHolders(owners) {
  const balances = holdings(owners);
  const live = [...latestOwners(owners).values()].filter(
    (row) => row.owner !== zeroAddress,
  );
  const distinct = new Set(live.map((row) => row.owner));
  const held = [...balances.values()].reduce((sum, n) => sum + n, 0n);
  if (balances.size !== distinct.size || held !== BigInt(live.length))
    throw new Error(
      `Holder balances count ${balances.size} holders and ${held} tokens, but the owner rows have ${distinct.size} distinct owners and ${live.length} live tokens.`,
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
  const { holders, held } = checkHolders(owners);
  return [
    `All ${mints} mints on ${day} come from the zero address, and only for tokens with no earlier owner`,
    `${tokenBlocks} transferred token-blocks each have exactly one owner row naming the receiver of the block's last transfer`,
    `${holders} holders own ${held} live tokens, matching the distinct owners in the owner rows`,
  ];
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function percent(part, whole) {
  const hundredths = (part * basisPoints) / whole;
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}%`;
}

function hourly(transfers) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    mints: 0,
    trades: 0,
  }));
  for (const transfer of transfers) {
    const hour = Math.floor(
      (transfer.block - dayWindow.from_block) / hourBlocks,
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
  return {
    top: top.map(([address, tokens]) => ({
      address: shortAddress(address),
      tokens: tokens.toString(),
      share: percent(tokens, total),
      fraction: Number(tokens) / Number(total),
    })),
    topShare: percent(topTotal, total),
    restShare: percent(total - topTotal, total),
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
