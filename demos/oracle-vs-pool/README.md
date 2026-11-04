# Oracle vs pool

One week of hourly prices on Ethereum: the ETH/USDC pool on Uniswap v4 next to
the Chainlink ETH/USD feed, with the gap between them, and a heartbeat table
for ETH/USD, BTC/USD and USDC/USD. The page proves its numbers: the pool price,
rebuilt from `sqrt_price_x96` with BigInt math and token decimals applied, must
be within 2% of the Chainlink answer in every hour, and every feed answer must
be positive.

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

Working directory: `demos/oracle-vs-pool`

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
headline numbers, a two-line chart of pool price against oracle price with the
gap shaded, a three-row feed heartbeat table, and three cross-checks.
Nothing is saved: a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails when the pool
price is inverted, when token decimals are left out, when one hour drifts 3%
from the feed, when a feed answer is not positive, or when an hour is missing,
and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Hours: `[2026-10-25T00, 2026-11-01T00)`, 168 UTC hours, each read at the
  hour's last block.
- The pool is ETH (currency0, 18 decimals) against USDC (currency1, 6
  decimals), so USD per ETH is `sqrt_price_x96² / 2¹⁹² × 10¹²`.
- Feeds answer with 8 decimals.
- The `feeds` bind returns 504 rows (3 feeds × 168 hours); that count is accepted for a one-week hourly view of three majors.

| Subject                         | Address                                                              | Note   |
| ------------------------------- | -------------------------------------------------------------------- | ------ |
| Uniswap v4 PoolManager          | `0x000000000004444c5dc75cb358380d2e3de08a90`                         |        |
| ETH/USDC pool id (0.05%)        | `0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27` | verify |
| Chainlink ETH/USD feed (proxy)  | `0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419`                         |        |
| Chainlink BTC/USD feed (proxy)  | `0xf4030086522a5beea4988f8ca5b36dbc97bee88c`                         |        |
| Chainlink USDC/USD feed (proxy) | `0x8fffffd4afb6115b954bd326cbe7b4ba576818f6`                         |        |

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first hour not included.

| Name    | Function                   | Chain | Params                  | Window                        |
| ------- | -------------------------- | ----- | ----------------------- | ----------------------------- |
| `pool`  | `uniswap_v4.pool_state`    | 1     | `manager`, `pool`, `by` | 2026-10-25T00 → 2026-11-01T00 |
| `feeds` | `aggregator.latest_answer` | 1     | `feeds`, `by`           | 2026-10-25T00 → 2026-11-01T00 |
