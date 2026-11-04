# Polymarket tape

One UTC day of Polymarket order-book fills on Polygon: the largest fills
(whale tape), the implied odds of the busiest market per hour, and fill volume
by builder code, plus the conditions that resolved that day. The page proves
its numbers: every fill prices within (0, 1] (collateral over outcome tokens,
compared as integers), every fee is booked in the asset its version and side
require, every fill carries a builder word, and each resolved condition lists
both outcomes once and pays a denominator equal to the sum of its numerators.

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

Working directory: `demos/polymarket-tape`

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
headline numbers, a table of the 12 largest fills, an hourly odds line for the
busiest market, a builder leaderboard, the resolved conditions, and four passed
cross-checks. Nothing is saved: a restart starts empty and the next fetch reads
again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-checks pass on the fixture (including a fill at a
price of exactly 1) and fail when amounts are swapped so a price exceeds 1,
collateral is zero, a fill is outside the window, from an unnamed exchange or
read twice, a fee is booked in the wrong asset, a version 1 fill carries a
builder code, a fill has no builder word, a condition resolves outside the
window, repeats or misses an outcome, pays nothing at all, or pays a denominator
that is not the sum of its numerators, or a leaderboard presents truncated
volumes as the whole; it also checks the shaped tape, odds line and server.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

Polygon (chain 137), 2026-11-01. Windows are half-open: the block window is
`[96523829, 96581429)`, 57,600 blocks, the nominal Polygon blocks per day.
**Verify before fetching:** both bounds were not checked against block
timestamps; to_block should be the first block of 2026-11-02. The page buckets fills into hours of 2,400 blocks.

| Subject                         | Address                                      | Note                        |
| ------------------------------- | -------------------------------------------- | --------------------------- |
| Polymarket CTF Exchange         | `0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e` | version 1, no builder codes |
| Polymarket NegRisk CTF Exchange | `0xc5d563a36ae78145c45a50134d48a1215220f80a` | version 1, no builder codes |
| Polymarket exchange (version 2) | `0xe2222d279d744050d28e00520010520000310f59` | verify; emits builder codes |
| ConditionalTokens (CTF)         | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |                             |

Builder codes exist only on version 2 fills, so version 1 fills appear as "No
builder code". Payouts are read for the same day only; the page does not link a
resolved condition to a market's token because fills carry token ids, not
condition ids.

## Binds (`src/report.mjs`)

| Name      | Function                               | Chain | Params               | Window              |
| --------- | -------------------------------------- | ----- | -------------------- | ------------------- |
| `fills`   | `polymarket_clob.order_fill`           | 137   | `exchanges` (3)      | 96523829 → 96581429 |
| `payouts` | `conditional_tokens.condition_payouts` | 137   | `conditional_tokens` | 96523829 → 96581429 |

`fills` is read in chunks of 2,400 blocks.
