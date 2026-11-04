# Aerodrome Slipstream

Swaps and volume per pool per day for every pool created by the Aerodrome
Slipstream factory on Base, ranked by dollars traded. The page proves its
numbers: every pool-day row has at least one swap, each known pool's dollar side
implies a sane token price, and the ranking covers every known pool that traded,
is in descending order of dollar volume and matches the sum of each pool's rows.

**The shipped recording is synthetic.** `recordings/synthetic.json` is generated
by `test/fixture.mjs` and the page says so in its banner. The eight pools
without a known dollar side use made-up addresses (`0x1111…`). Record real data
with `npm run record` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/aerodrome-slipstream`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a daily dollar-volume line for each
ranked pool, a table of ranked pools, a table of unranked pools, and three
passed cross-checks.

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
the shaped report. `npm run test:browser` writes
`docs/screenshot-desktop.png`. `npm run fixture` regenerates the synthetic
recording.

## Subjects and window

- Factory: Aerodrome Slipstream CL factory on Base,
  `0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a` (verify before recording).
- Window: UTC days `[2026-10-25, 2026-11-02)`, eight days. `to_day` is
  exclusive.
- Volume is a pool's tokens paid in plus paid out, in raw units. Pools of
  different token pairs can only be compared in dollars, so the ranking uses
  the dollar side of the pools listed in `knownPools` in `src/report.mjs`. Any
  other pool is listed in a separate table by swaps, with no dollar volume.

| Pool         | Address                                      | Dollar side      | Note                    |
| ------------ | -------------------------------------------- | ---------------- | ----------------------- |
| WETH / USDC  | `0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59` | `volume1` (USDC) | verify before recording |
| USDC / cbBTC | `0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef` | `volume0` (USDC) | verify before recording |

USDC on Base is `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` with 6 decimals.

## Binds (`testril.json`)

| Name          | Function                 | Chain | Params                         | Window                  |
| ------------- | ------------------------ | ----- | ------------------------------ | ----------------------- |
| `pool-volume` | `uniswap_v3.pool_volume` | 8453  | `swap.pool_list.factory`, `by` | 2026-10-25 → 2026-11-02 |

## Record real data

Verify the USDC / cbBTC pool is from the Slipstream factory before recording.

The demo records itself. It needs a private key whose address holds Testril
usage credits; it pays with vouchers against those credits, so the wallet
needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to record    |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

Working directory: `demos/aerodrome-slipstream`

```sh
export TESTRIL_PAYER_KEY=<hex private key>
npm run record
```

For each bind in `testril.json`, `npm run record` calls `bind`, asks
`materialize` for the whole window (Testril charges only for blocks not yet
indexed), waits for the job, then `read`s the window. It writes
`recordings/recorded.json` (git-ignored) with `source: "dev"`, the bound
function ids, job ids, timings and the usage credits spent. The page then
shows "Recorded from Testril on <date>". A failed run leaves the previous
recording in place.

`npm test` runs `npm run record` against a fake Testril: it pays with the
payer's vouchers, follows each `materialize` answer and keeps every row.
