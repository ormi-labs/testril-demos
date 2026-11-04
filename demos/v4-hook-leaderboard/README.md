# V4 hook leaderboard

Which Uniswap v4 hooks carry the swaps on Ethereum. Every pool the v4
PoolManager has initialized is joined to a week of daily swap volume and grouped
by its hook; Arrakis private hooks are labelled, and pools at the zero address
are shown as "No hook". The page proves its numbers: every pool with volume
must be in the pool list, and the hooks' swaps must add up to the volume rows'
swaps.

**The shipped recording is synthetic.** `recordings/synthetic.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`npm run record` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/v4-hook-leaderboard`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a bar chart of swaps for the ten
busiest hooks, a leaderboard table of up to twelve hooks, and three passed
cross-checks.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails when a volume
pool is missing from the pool list, when a pool is listed twice, or when a
volume day is outside the window, that hook totals equal their pools' volume,
that the stablecoin side of each pool is the one summed, and that the server
returns the shaped report. `npm run test:browser` writes
`docs/screenshot-desktop.png`. `npm run fixture` regenerates the synthetic
recording.

## Subjects and window

- Pools: every pool the PoolManager initialized, from its creation block
  21688329 to the first block of 2026-11-02 UTC, `[21688329, 26323365)`
  (the end block is an estimate, verify it before recording).
- Volume: UTC days `[2026-10-25, 2026-11-02)`, one row per pool per day.
- Volume in dollars is the USDC or USDT side of a pool (6 decimals); pools with
  neither show swaps only.
- Arrakis hooks: the private hooks created by the Arrakis hook factory, from
  the factory's creation block to the same end block (the factory address and
  its creation block are placeholders, verify both before recording).

| Subject                | Address                                      | Note                                                                           |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Uniswap v4 PoolManager | `0x000000000004444c5dc75cb358380d2e3de08a90` |                                                                                |
| Arrakis hook factory   | `0xef129a430032c8183aba158c1a70799e3b840df9` | verify before recording: known on Base, not confirmed on Ethereum              |
| Factory creation       | block 21688329                               | verify before recording: placeholder (PoolManager creation), use the factory's |
| PoolManager creation   | block 21688329                               | verify before recording                                                        |
| Pool window end        | block 26323365                               | verify before recording: must be the first block at or after 2026-11-02T00:00Z |
| USDC                   | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |                                                                                |
| USDT                   | `0xdac17f958d2ee523a2206206994597c13d831ec7` |                                                                                |

## Binds (`testril.json`)

Windows are half-open: the end is the first block or day not included.

| Name            | Function                 | Chain | Params       | Window                  |
| --------------- | ------------------------ | ----- | ------------ | ----------------------- |
| `pools`         | `uniswap_v4.pool_list`   | 1     | `manager`    | 21688329 → 26323365     |
| `volume`        | `uniswap_v4.pool_volume` | 1     | `swap`, `by` | 2026-10-25 → 2026-11-02 |
| `arrakis-hooks` | `arrakis.hook_list`      | 1     | `factory`    | 21688329 → 26323365     |

`pools` and `arrakis-hooks` are read in chunks of 100000 blocks.

## Record real data

Do not run `npm run record` until the Arrakis hook factory address and creation block and the pool window end block in `testril.json` are verified on the chain.

The demo records itself. It needs a private key whose address holds Testril
usage credits; it pays with vouchers against those credits, so the wallet
needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to record    |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

Working directory: `demos/v4-hook-leaderboard`

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
