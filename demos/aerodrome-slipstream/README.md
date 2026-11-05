# Aerodrome Slipstream

Swaps and volume per pool per day for every pool created by the Aerodrome
Slipstream factory on Base, ranked by dollars traded. The page proves its
numbers: every pool-day row has at least one swap, each known pool's dollar side
implies a sane token price, and the ranking covers every known pool that traded,
is in descending order of dollar volume and matches the sum of each pool's rows.

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
headline numbers, a daily dollar-volume line for each ranked pool, a table of
ranked pools, a table of unranked pools, and three cross-checks. Nothing
is saved: a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

Verify the USDC / cbBTC pool is from the Slipstream factory before fetching.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a pool-day
with zero swaps, a duplicated pool-day, a day outside the window, a pool whose
volumes are read swapped, a leaderboard sum that does not match its rows, a
leaderboard out of order or missing a known pool, that the dollar side of each
pool (not the 18-decimal side) decides the ranking, and that the server returns
the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Factory: Aerodrome Slipstream CL factory on Base,
  `0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a` (verify).
- Window: the eight UTC days before the day of the press, from
  `from_time` eight days before today 00:00 UTC to `to_time` today 00:00 UTC.
- Volume is a pool's tokens paid in plus paid out, in raw units. Pools of
  different token pairs can only be compared in dollars, so the ranking uses
  the dollar side of the pools listed in `knownPools` in `src/report.mjs`. Any
  other pool is listed in a separate table by swaps, with no dollar volume.

| Pool         | Address                                      | Dollar side      | Note   |
| ------------ | -------------------------------------------- | ---------------- | ------ |
| WETH / USDC  | `0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59` | `volume1` (USDC) | verify |
| USDC / cbBTC | `0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef` | `volume0` (USDC) | verify |

USDC on Base is `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` with 6 decimals.

## Binds (`src/report.mjs`)

| Name          | Function                 | Chain | Params                         | Window         |
| ------------- | ------------------------ | ----- | ------------------------------ | -------------- |
| `pool-volume` | `uniswap_v3.pool_volume` | 8453  | `swap.pool_list.factory`, `by` | 8 days → today |
