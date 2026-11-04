# Flap launchpad

Which launchpad tokens traded the most on Flap (BSC) over eight days: BNB
bought and sold per token, ranked by volume. The page proves its numbers: for
one day, each token's daily buy and sell sums must equal the sums of its
individual trade rows, and every trade fee must be non-negative.

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

Working directory: `demos/flap-launchpad`

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
headline numbers, a buys-vs-sells bar chart of the ten largest tokens, a table
of all ranked tokens, and three passed cross-checks. Nothing is saved: a restart
starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails when a sell
is read as a buy, when volume is in BNB instead of raw wei, when a trade is
missing, when a fee is negative, or when a day is missing, and that the server
returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Flap portal on BSC `0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0`
  (verify).
- Volume: UTC days `[2026-10-25, 2026-11-02)`, per token and quote asset.
- Trades: 2026-11-01, blocks `[130949246, 131141195)`, found by binary search
  over the public BSC RPC. They match the volume rows for 2026-11-01.
  Verify before fetching: block 130949246 must have timestamp
  2026-11-01 00:00:00 UTC or later with block 130949245 earlier, and block
  131141195 must be the first at or after 2026-11-02 00:00:00 UTC. The
  window covers 191,949 blocks against BSC's roughly 192,000 per day.
- Amounts are raw wei of the quote asset. The page ranks tokens quoted in BNB
  (the zero address) only.

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block or day not included.

| Name     | Function            | Chain | Params       | Window                  |
| -------- | ------------------- | ----- | ------------ | ----------------------- |
| `volume` | `flap.token_volume` | 56    | `swap`, `by` | 2026-10-25 → 2026-11-02 |
| `trades` | `flap.trade`        | 56    | `portal`     | 130949246 → 131141195   |

`trades` is read in chunks of 20000 blocks.
