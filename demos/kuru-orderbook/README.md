# Kuru order book

Every market the Kuru router registered on Monad, ranked by taker volume over
eight days, with the fees takers paid and the rebates makers earned. The page
proves its numbers: every volume row must belong to a registered market, fees
and rebates must be non-negative, and each market has one row per day inside the
window.

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

Working directory: `demos/kuru-orderbook`

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
headline numbers, a bar chart of taker volume for the USDC-quoted markets, a
table of all markets with fees and rebates, and three cross-checks.
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

`npm test` checks the cross-check passes on the fixture and fails on an
unregistered market, a negative rebate, a duplicate market-day and a row outside
the window, and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Kuru router on Monad (chain 143)
  `0xd651346d7c789536ebf06dc72ae3c8502cd695cc` (verify).
- USDC on Monad `0x754704bc059f8c67012fed69bc8a327a5aafb603` (verify before
  fetching). Markets quoted in it are ranked and charted together; markets
  quoted in another asset are listed after them, in that asset.
- Symbols for WMON, WETH, WBTC and USDT0 come from fixed addresses in
  `src/report.mjs` (verify); other assets show shortened hex.
- Volume: the eight UTC days before the day of the press.
- Markets: from the start of the chain (`from_time` 1970-01-01T00:00:00Z, the
  timestamp of Monad's block 0) to 00:00 UTC on the day of the press. The
  router's registrations are read from the start of the chain so every market
  that traded in the window is listed.

Volumes, fees and rebates are whole tokens with 18 decimals whatever the token's
own decimals; the page divides by 10^18.

## Binds (`src/report.mjs`)

Windows end at 00:00 UTC on the day of the press; the end is not included.

| Name      | Function             | Chain | Params                       | Window              |
| --------- | -------------------- | ----- | ---------------------------- | ------------------- |
| `markets` | `kuru.market_list`   | 143   | `router`                     | chain start → today |
| `volume`  | `kuru.market_volume` | 143   | `swap.market_list`, `by` day | 8 days → today      |

`volume` depends on the router's `kuru.trade` rows, which depend on
`kuru.market_list`.
