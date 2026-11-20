# Polymarket builders

One UTC day of Polymarket order-book volume on Polygon by builder code, and how
the conditions that resolved that day paid out. Testril's
`polymarket_clob.builder_volume` counts every `OrderFilled` under the builder
code of the order it filled, so a match counts its maker and taker orders alike
and builder volume adds up to more than the volume traded. The page proves its
numbers: every builder row is for the day, from a named exchange, once per
builder code and exchange, with a fill and a fee no larger than its collateral;
version 1 exchanges credit only the zero code; the leaderboard adds up to the
total; and each resolved condition lists both outcomes once and pays a
denominator equal to the sum of its numerators.

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

Working directory: `demos/polymarket-builders`

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
headline numbers, a builder leaderboard (the top 8 and the rest summed), how
the resolved conditions paid out, and four cross-checks. Nothing is saved: a restart starts empty and the next fetch reads
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

`npm test` checks the cross-checks pass on the fixture and fail when a builder
row is for another day, from an unnamed exchange, read twice, not a 32-byte
code, a builder code on a version 1 exchange, or has a fee larger than its
collateral; when a condition resolves outside the window, repeats or misses an
outcome, pays nothing at all, or pays a denominator that is not the sum of its
numerators; and when a leaderboard presents truncated volumes as the whole. It
also checks that a builder's rows on several exchanges sum into one entry and
the shaped headline, leaderboard and payout summary.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

Polygon (chain 137), the UTC day before the day of the press (yesterday, 00:00
to 24:00, as `from_time` and `to_time`). Builder volume is one read of the day.
Payouts are read in 24 one-hour chunks, since a day resolves over 20,000
conditions (2026-11-19: 21,556, 43,112 payout rows, the busiest hour 7,222);
the check fails on a payout outside the day's block range.

| Subject                         | Address                                      | Note                        |
| ------------------------------- | -------------------------------------------- | --------------------------- |
| Polymarket CTF Exchange         | `0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e` | version 1, no builder codes |
| Polymarket NegRisk CTF Exchange | `0xc5d563a36ae78145c45a50134d48a1215220f80a` | version 1, no builder codes |
| Polymarket exchange (version 2) | `0xe2222d279d744050d28e00520010520000310f59` | emits builder codes; pUSD   |
| ConditionalTokens (CTF)         | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` |                             |

Builder codes exist only on version 2, so version 1 fills sit under "No builder
code". A builder's rows on several exchanges are summed; the collateral is
USDC.e on version 1 and pUSD on version 2, both 6 decimals and counted as USD.
Payouts are not linked to markets: builder rows carry no condition id. The
largest fills and hourly odds are not shown: one day holds over 500,000 fills
(2026-11-19: 527,296), more than a read can serve until Testril pages them.

## Binds (`src/report.mjs`)

| Name       | Function                               | Chain | Params                          | Window    |
| ---------- | -------------------------------------- | ----- | ------------------------------- | --------- |
| `builders` | `polymarket_clob.builder_volume`       | 137   | `swap.exchanges` (3), `by: day` | yesterday |
| `payouts`  | `conditional_tokens.condition_payouts` | 137   | `conditional_tokens`            | yesterday |
