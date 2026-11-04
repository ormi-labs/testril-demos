# USDC depeg replay

The Chainlink USDC/USD answer for every hour of 10–14 March 2023 on Ethereum,
next to what USDC burned and minted in the same hours, and the addresses that
burned the most. The page proves its numbers: in every hour the USDC supply
change must equal mints minus burns from the transfer edges, and the Chainlink
answer must stay between $0.80 and $1.02.

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

Working directory: `demos/usdc-depeg-replay`

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
headline numbers, a timeline of the answer above net burns per hour, a table of
the biggest burning addresses, and three cross-checks. Nothing is saved:
a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-checks pass on the fixture and fail when a burn is
read as a mint, when supply is in whole dollars instead of raw units, when the
answer is read with the wrong decimals, or when an hour is missing, and that the
server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- USDC `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`, 6 decimals.
- Chainlink USDC/USD aggregator `0x8fffffd4afb6115b954bd326cbe7b4ba576818f6`,
  8 decimals. Verify before fetching.
- Hours: UTC hours `[2023-03-10T00, 2023-03-15T00)`, read at each hour's last
  block.
- Transfers: blocks `[16794062, 16829610)`, the first block of 2023-03-10T00 up
  to the first block of 2023-03-15T00, so they cover the same 120 hours.
- `src/hour-first-blocks.json` holds the first block of each hour, found by
  binary search over the public RPC ethereum-rpc.publicnode.com. `check` uses
  it to put each transfer edge in its hour.

The first hour has no earlier supply row, so 119 hours are cross-checked.

USDC `burn()` emits a transfer from the caller to the zero address, and the
caller is a Circle-controlled minter, so the burning-addresses table lists
those minters, not the exchanges that sent USDC to Circle. The test fixture mints
to Circle `0x55fe002aeff02f77364de339a1292923a15844b8`. Verify
before fetching.

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block or hour not included.

| Name            | Function                   | Chain | Params          | Window                        |
| --------------- | -------------------------- | ----- | --------------- | ----------------------------- |
| `supply`        | `erc20.token_supply`       | 1     | `tokens`, `by`  | 2023-03-10T00 → 2023-03-15T00 |
| `usdc-edges`    | `erc20.transfer_edges`     | 1     | `token_address` | 16794062 → 16829610           |
| `usdc-usd-feed` | `aggregator.latest_answer` | 1     | `feeds`, `by`   | 2023-03-10T00 → 2023-03-15T00 |

`usdc-edges` is read in chunks of 600 blocks.
