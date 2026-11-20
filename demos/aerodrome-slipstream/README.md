# Aerodrome Slipstream

Swaps and volume per pool per day for every pool the four Aerodrome Slipstream
factories on Base created, with the pools that trade against USDC ranked by the
USDC they traded. The page proves its numbers: every pool-day row has at least
one swap and its pool is in a factory's list, every USDC / WETH pool-day implies
a sane WETH price, and the ranking covers every USDC pool that traded, is in
descending order and matches the sum of each pool's rows.

Every number on the page comes live from Testril when you press **Fetch from
Testril**. The first fetch has Testril index the data; later fetches only read
what Testril already indexed.

## Prerequisites

- Node.js 22.13 or later
- A private key whose address holds Testril usage credits. The demo pays with
  vouchers against those credits, so the wallet needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to fetch     |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://api.testril.si/mcp` |

## Run

Working directory: `demos/aerodrome-slipstream`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws four
headline numbers, a daily USDC-volume line for the four leading pools, the top
20 ranked pools, the top 10 pools without USDC by swaps, and three
cross-checks. Nothing
is saved: a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a pool-day
with zero swaps, a duplicated pool-day, a day outside the window, a pool that
traded but is not listed, a pool listed twice, a USDC / WETH pool whose volumes
are read swapped or that moved no WETH, and a leaderboard sum that does not
match its rows, is out of order or misses a USDC pool; that each pool is priced
by its USDC side whichever token it is, across factories; and that the server
returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Factories: the four Aerodrome Slipstream CL factories on Base, the list
  DefiLlama's Slipstream adapter counts. Each pool list is read from its
  factory's creation block, found with `eth_getCode`.
- Window: the eight UTC days before the day of the press, from `from_time`
  eight days before today 00:00 UTC to `to_time` today 00:00 UTC.
- Volume is a pool's tokens paid in plus paid out, in raw units. Pools of
  different pairs only compare in dollars, so a pool is ranked when Testril's
  pool list names USDC as its `token0` or `token1`, by that side. Other pools
  are listed by swaps. On 2026-11-12 to 11-19 the ranked pools traded
  $621,062,537.64, against $819.2M for all Slipstream pools on DefiLlama.
- Pair labels name USDC, WETH and cbBTC by hand; other tokens show their
  address.

| Factory                                      | Created (block, UTC)           |
| -------------------------------------------- | ------------------------------ |
| `0x9592cd9b267748cbfbde90ac9f7df3c437a6d51b` | 13527358, 2024-04-23T03:47:43Z |
| `0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a` | 13843704, 2024-04-30T11:32:35Z |
| `0xade65c38cd4849adba595a4323a8c7ddfe89716a` | 36953918, 2025-10-17T10:33:03Z |
| `0xf8f2eb4940cfe7d13603dddd87f123820fc061ef` | 44394724, 2026-04-07T16:19:55Z |

USDC on Base is `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` with 6 decimals;
WETH is `0x4200000000000000000000000000000000000006`.

## Binds (`src/report.mjs`)

Per factory, two binds named by the factory's first six characters:

| Name         | Function                 | Chain | Params                         | Window                         |
| ------------ | ------------------------ | ----- | ------------------------------ | ------------------------------ |
| `pools-0x…`  | `uniswap_v3.pool_list`   | 8453  | `factory`                      | creation → today, 30-day reads |
| `volume-0x…` | `uniswap_v3.pool_volume` | 8453  | `swap.pool_list.factory`, `by` | 8 days → today                 |
