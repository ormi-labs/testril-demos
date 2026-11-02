import spec from "../testril.json" with { type: "json" };

const transferBinds = spec.binds.filter(
  (bind) => bind.function_slug === "erc20.wallet_transfers",
);
const balanceBinds = spec.binds.filter(
  (bind) => bind.function_slug === "native.balance",
);
const tokenBalanceBinds = spec.binds.filter(
  (bind) => bind.function_slug === "erc20.token_balance",
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
export const blocksPerHour = 7200 / 24;
const rebasingTokens = new Set(["0xae7ab96520de3a18e5e111b5eaab095312d7fe84"]);
const rebaseToleranceDivisor = 2000n;
const rebaseRoundingWei = 2n;
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const label = (address) => names.get(address) ?? shortAddress(address);
const transferKey = (row) => `${row.tx}:${row.log_index}`;
const edgeKey = (from, to) => `${from}>${to}`;

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

function hourlyTransferChanges(rows) {
  const changes = new Map();
  for (const { row } of uniqueTransfers(rows).values()) {
    const hour = Math.floor(
      (row.block - transferWindow.from_block) / blocksPerHour,
    );
    for (const [wallet, sign] of [
      [row.to, 1n],
      [row.from, -1n],
    ]) {
      const key = `${wallet}:${row.token}:${hour}`;
      changes.set(key, (changes.get(key) ?? 0n) + sign * BigInt(row.value));
    }
  }
  return changes;
}

function allowedDrift(token, balance) {
  return rebasingTokens.has(token)
    ? balance / rebaseToleranceDivisor + rebaseRoundingWei
    : 0n;
}

function checkBalancesFollowTransfers(rows) {
  const changes = hourlyTransferChanges(rows);
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
        const expected = changes.get(`${wallet}:${token}:${index}`) ?? 0n;
        const drift = after - before - expected;
        const allowed = allowedDrift(token, before > after ? before : after);
        if (drift > allowed || -drift > allowed)
          throw new Error(
            `${label(wallet)} ${symbols.get(token)} balance moved by ${formatAmount(after - before, true)} in ${hours[index]}, but its transfers moved ${formatAmount(expected, true)}.`,
          );
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
    "Every wallet's hourly token balance changes by exactly its transfers in that hour (stETH within 0.05% for rebases)",
    `Balance rows sit only in the ${hoursInWindow().length} hours of the window`,
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
  for (const { from, to, token, value } of entries) {
    const key = `${edgeKey(from, to)}>${token}`;
    const edge = totals.get(key) ?? { from, to, token, amount: 0n };
    edge.amount += BigInt(value);
    totals.set(key, edge);
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

const sumValues = (entries) =>
  entries.reduce((sum, entry) => sum + BigInt(entry.value), 0n);

function walletTokens(entries, address) {
  return tokens
    .map((token) => {
      const ofToken = entries.filter((entry) => entry.token === token);
      const received = sumValues(ofToken.filter((e) => e.to === address));
      const sent = sumValues(ofToken.filter((e) => e.from === address));
      return {
        symbol: symbols.get(token),
        received,
        sent,
        formatted: {
          received: formatAmount(received),
          sent: formatAmount(sent),
          net: formatAmount(received - sent, true),
        },
      };
    })
    .filter((entry) => entry.received > 0n || entry.sent > 0n);
}

export function shape(rows) {
  const entries = [...uniqueTransfers(rows).values()].map((e) => e.row);
  const edges = sumEdges(entries);
  const hops = hopsFrom(source, edges);
  const routes = edges.filter((edge) => edge.amount >= minDrawnAmount);
  const routeCount = (address) =>
    routes.filter((edge) => edge.to === address).length;
  const outside = [...new Set(routes.map((edge) => edge.to))]
    .filter((address) => !wallets.includes(address))
    .sort((a, b) => routeCount(b) - routeCount(a) || a.localeCompare(b))
    .slice(0, maxNodes - wallets.length);
  const shown = new Set([...wallets, ...outside]);
  const deepestHop = Math.max(
    ...wallets.map((address) => hops.get(address) ?? 0),
  );
  const nodes = [...shown]
    .filter((address) => hops.has(address))
    .map((address) => ({
      address,
      label: label(address),
      hop: wallets.includes(address) ? hops.get(address) : deepestHop + 1,
      tracked: wallets.includes(address),
    }));
  const drawn = routes.filter(
    (edge) => shown.has(edge.from) && shown.has(edge.to),
  );
  const biggest = new Map(
    tokens.map((token) => [
      token,
      Math.max(
        ...drawn.filter((e) => e.token === token).map((e) => asFloat(e.amount)),
      ),
    ]),
  );
  return {
    transferWindow,
    hourWindow,
    headline: {
      intoExploiter: walletTokens(entries, exploiter).map((entry) => ({
        symbol: entry.symbol,
        amount: entry.formatted.received,
      })),
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
        sumValues(entries.filter((entry) => entry.token === token)),
      ),
    })),
    nodes,
    edges: drawn.map((edge) => ({
      from: edge.from,
      to: edge.to,
      symbol: symbols.get(edge.token),
      tokenIndex: tokens.indexOf(edge.token),
      amount: formatAmount(edge.amount),
      share: asFloat(edge.amount) / biggest.get(edge.token),
    })),
    hiddenEdges: edges.length - drawn.length,
    wallets: transferBinds.map((bind, index) => {
      const address = bind.params.wallet;
      return {
        address,
        label: label(address),
        hop: hops.get(address) ?? null,
        tokens: walletTokens(entries, address).map((entry) => ({
          symbol: entry.symbol,
          ...entry.formatted,
        })),
        spark: sparkline(rows, balanceBinds[index]),
      };
    }),
  };
}
