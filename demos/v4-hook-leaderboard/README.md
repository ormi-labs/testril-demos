# V4 hook leaderboard

Which Uniswap v4 hooks carry the swaps on Ethereum. Every pool the v4
PoolManager has initialized is joined to a week of daily swap volume and grouped
by its hook; Arrakis private hooks are labelled, and pools at the zero address
are shown as "No hook". The page proves its numbers: every pool with volume
must be in the pool list, and the hooks' swaps must add up to the volume rows'
swaps.

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
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

## Run

Working directory: `demos/v4-hook-leaderboard`

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
headline numbers, a bar chart of swaps for the ten busiest hooks, a leaderboard
table of up to twelve hooks, and three cross-checks. Nothing is saved: a
restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

Do not press **Fetch from Testril** until the Arrakis hook factory address and creation block and the pool window end block in `src/report.mjs` are verified on the chain.

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
returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Pools: every pool the PoolManager initialized, from its creation block
  21688329 to the first block of 2026-11-02 UTC, `[21688329, 26323365)`
  (the end block is an estimate, verify it before fetching).
- Volume: UTC days `[2026-10-25, 2026-11-02)`, one row per pool per day.
- Volume in dollars is the USDC or USDT side of a pool (6 decimals); pools with
  neither show swaps only.
- Arrakis hooks: the private hooks created by the Arrakis hook factory, from
  the factory's creation block to the same end block (the factory address and
  its creation block are placeholders, verify both before fetching).

| Subject                | Address                                      | Note                                                          |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Uniswap v4 PoolManager | `0x000000000004444c5dc75cb358380d2e3de08a90` |                                                               |
| Arrakis hook factory   | `0xef129a430032c8183aba158c1a70799e3b840df9` | verify: known on Base, not confirmed on Ethereum              |
| Factory creation       | block 21688329                               | verify: placeholder (PoolManager creation), use the factory's |
| PoolManager creation   | block 21688329                               | verify                                                        |
| Pool window end        | block 26323365                               | verify: must be the first block at or after 2026-11-02T00:00Z |
| USDC                   | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` |                                                               |
| USDT                   | `0xdac17f958d2ee523a2206206994597c13d831ec7` |                                                               |

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block or day not included.

| Name            | Function                 | Chain | Params       | Window                  |
| --------------- | ------------------------ | ----- | ------------ | ----------------------- |
| `pools`         | `uniswap_v4.pool_list`   | 1     | `manager`    | 21688329 → 26323365     |
| `volume`        | `uniswap_v4.pool_volume` | 1     | `swap`, `by` | 2026-10-25 → 2026-11-02 |
| `arrakis-hooks` | `arrakis.hook_list`      | 1     | `factory`    | 21688329 → 26323365     |

`pools` and `arrakis-hooks` are read in chunks of 100000 blocks.
