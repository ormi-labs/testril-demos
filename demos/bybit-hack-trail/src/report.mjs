import spec from "../testril.json" with { type: "json" };

const transferBinds = spec.binds.filter(
  (bind) => bind.function_slug === "erc20.wallet_transfers",
);
const balanceBinds = spec.binds.filter(
  (bind) => bind.function_slug === "native.balance",
);
export const transferWindow = transferBinds[0].window;
export const hourWindow = balanceBinds[0].window;
export const wallets = transferBinds.map((bind) => bind.params.wallet);
const [source, exploiter] = wallets;
export const maxNodes = 10;
const minDrawnAmount = 1000n * 10n ** 18n;

const titles = {
  "bybit-cold-wallet": "Bybit cold wallet",
  exploiter: "Exploiter",
  "hop-a4b2": "Wallet 0xa4b2…449e",
  "hop-bdd0": "Wallet 0xbdd0…9516",
  "hop-0fa0": "Wallet 0x0fa0…6d2e",
  "hop-1542": "Wallet 0x1542…0d04",
};
const names = new Map(
  transferBinds.map((bind) => [
    bind.params.wallet,
    titles[bind.name.replace("transfers-", "")],
  ]),
);
const symbols = new Map([
  ["0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "stETH"],
  ["0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa", "mETH"],
  ["0xe6829d9a7ee3040e1276fa75293bde931859e8fa", "cmETH"],
]);
export const tokens = transferBinds[0].params.tokens;

const unit = 10n ** 18n;
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const label = (address) => names.get(address) ?? shortAddress(address);
const transferKey = (row) => `${row.tx}:${row.log_index}`;
const edgeKey = (from, to) => `${from}>${to}`;
const byChainOrder = (a, b) =>
  a.block - b.block || Number(a.log_index) - Number(b.log_index);

export function hoursInWindow() {
  const hours = [];
  const end = Date.parse(`${hourWindow.to_hour}:00:00Z`);
  for (
    let time = Date.parse(`${hourWindow.from_hour}:00:00Z`);
    time < end;
    time += 3600000
  )
    hours.push(new Date(time).toISOString().slice(0, 13));
  return hours;
}

export function formatAmount(raw, signed = false) {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const whole = ((abs + unit / 2n) / unit).toLocaleString("en-US");
  return `${negative ? "−" : signed && abs > 0n ? "+" : ""}${whole}`;
}

const asFloat = (raw) => Number(raw / 10n ** 15n) / 1000;

function uniqueTransfers(rows) {
  const unique = new Map();
  for (const bind of transferBinds)
    for (const row of rows[bind.name])
      if (!unique.has(transferKey(row)))
        unique.set(transferKey(row), { row, seenIn: new Set() });
  for (const bind of transferBinds)
    for (const row of rows[bind.name])
      unique.get(transferKey(row)).seenIn.add(bind.params.wallet);
  return unique;
}

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

function checkBalancesFollowTransfers(rows) {
  const ordered = [...uniqueTransfers(rows).values()]
    .map((entry) => entry.row)
    .sort(byChainOrder);
  for (const wallet of wallets.filter((address) => address !== source)) {
    const held = new Map(tokens.map((token) => [token, 0n]));
    for (const row of ordered) {
      if (row.to === wallet)
        held.set(row.token, held.get(row.token) + BigInt(row.value));
      if (row.from === wallet)
        held.set(row.token, held.get(row.token) - BigInt(row.value));
      if (held.get(row.token) < 0n)
        throw new Error(
          `${label(wallet)} sends more ${symbols.get(row.token)} than it received by block ${row.block}.`,
        );
    }
  }
}

function checkNativeBalances(rows) {
  const hours = new Set(hoursInWindow());
  for (const bind of balanceBinds) {
    const { owners } = bind.params;
    const seen = new Set();
    for (const row of rows[bind.name]) {
      if (row.owner !== owners[0] || !hours.has(row.hour) || seen.has(row.hour))
        throw new Error(
          `${bind.name} has a stray or repeated ${row.hour} row.`,
        );
      seen.add(row.hour);
    }
  }
}

export function check(rows) {
  checkTransferRows(rows);
  checkBothSidesAgree(rows);
  checkBalancesFollowTransfers(rows);
  checkNativeBalances(rows);
  const entries = [...uniqueTransfers(rows).values()];
  const readTwice = entries.filter((entry) => entry.seenIn.size > 1).length;
  return [
    `${entries.length} transfers counted once each, ${readTwice} of them read from both wallets`,
    "Every transfer between two trail wallets appears, identical, on both sides",
    "No wallet after the Bybit cold wallet sends more of a token than it received",
    `Native balances sit only in the ${hoursInWindow().length} hours of the window`,
  ];
}

function hopsFrom(start, edges) {
  const hops = new Map([[start, 0]]);
  const queue = [start];
  for (const current of queue)
    for (const edge of edges)
      if (edge.from === current && !hops.has(edge.to)) {
        hops.set(edge.to, hops.get(current) + 1);
        queue.push(edge.to);
      }
  return hops;
}

function sumEdges(entries) {
  const totals = new Map();
  for (const { from, to, value } of entries) {
    const edge = totals.get(edgeKey(from, to)) ?? {
      from,
      to,
      amount: 0n,
      count: 0,
    };
    edge.amount += BigInt(value);
    edge.count += 1;
    totals.set(edgeKey(from, to), edge);
  }
  return [...totals.values()];
}

function sparkline(rows, bind) {
  const balances = new Map(
    rows[bind.name].map((row) => [row.hour, BigInt(row.balance)]),
  );
  const series = hoursInWindow().map((hour) => ({
    hour,
    eth: asFloat(balances.get(hour) ?? 0n),
  }));
  const peak = Math.max(...series.map((point) => point.eth));
  return {
    series,
    peak: `${peak.toLocaleString("en-US", { maximumFractionDigits: 0 })} ETH`,
  };
}

export function shape(rows) {
  const entries = [...uniqueTransfers(rows).values()].map((e) => e.row);
  const edges = sumEdges(entries);
  const hops = hopsFrom(source, edges);
  const routes = edges.filter((edge) => edge.amount >= minDrawnAmount);
  const outside = [...new Set(routes.map((edge) => edge.to))]
    .filter((address) => !wallets.includes(address))
    .map((address) => ({
      address,
      volume: edges
        .filter((edge) => edge.to === address)
        .reduce((sum, edge) => sum + edge.amount, 0n),
    }))
    .sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0))
    .slice(0, maxNodes - wallets.length);
  const shown = new Set([...wallets, ...outside.map((node) => node.address)]);
  const nodes = [...shown]
    .filter((address) => hops.has(address))
    .map((address) => ({
      address,
      label: label(address),
      hop: hops.get(address),
      tracked: wallets.includes(address),
    }));
  const drawn = routes.filter(
    (edge) => shown.has(edge.from) && shown.has(edge.to),
  );
  const received = (address) =>
    edges.filter((e) => e.to === address).reduce((s, e) => s + e.amount, 0n);
  const sent = (address) =>
    edges.filter((e) => e.from === address).reduce((s, e) => s + e.amount, 0n);
  return {
    transferWindow,
    hourWindow,
    headline: {
      stolen: formatAmount(received(exploiter)),
      reached: String(
        nodes.filter((node) => node.tracked && node.hop > 0).length,
      ),
      destinations: String(outside.length),
      transfers: String(entries.length),
    },
    tokens: tokens.map((token) => ({
      symbol: symbols.get(token),
      token,
      moved: formatAmount(
        entries
          .filter((e) => e.token === token)
          .reduce((s, e) => s + BigInt(e.value), 0n),
      ),
    })),
    nodes,
    edges: drawn.map((edge) => ({
      from: edge.from,
      to: edge.to,
      amount: formatAmount(edge.amount),
      units: asFloat(edge.amount),
    })),
    hiddenEdges: edges.length - drawn.length,
    wallets: transferBinds.map((bind, index) => {
      const address = bind.params.wallet;
      return {
        address,
        label: label(address),
        hop: hops.get(address) ?? null,
        received: formatAmount(received(address)),
        sent: formatAmount(sent(address)),
        net: formatAmount(received(address) - sent(address), true),
        spark: sparkline(rows, balanceBinds[index]),
      };
    }),
  };
}
