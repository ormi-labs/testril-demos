# Polymarket tape

One UTC day of Polymarket order-book fills on Polygon: the largest fills
(whale tape), the implied odds of the busiest market per hour, and fill volume
by builder code, plus the conditions that resolved that day. The page proves
its numbers: every fill prices within (0, 1] (collateral over outcome tokens,
compared as integers), builder volumes add up to total volume, and each
resolved condition pays a denominator equal to the sum of its numerators.

**The shipped recording is synthetic.** `recordings/report.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`tools/prepare` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/polymarket-tape`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a table of the 12 largest fills, an
hourly odds line for the busiest market, a builder leaderboard, the resolved
conditions, and three passed cross-checks.

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
read twice, or a payout denominator is not the sum of its numerators; it also
checks the shaped tape, odds line and server. `npm run test:browser` writes
`docs/screenshot-desktop.png`. `npm run fixture` regenerates the recording.

## Subjects and window

Polygon (chain 137), 2026-11-01. Windows are half-open: the block window is
`[96523829, 96581429)`, the 57,600 blocks from the first block at or after
2026-11-01T00:00Z to the first block of 2026-11-02, found by binary search over
a public RPC. The page buckets fills into hours of 2,400 blocks.

| Subject                         | Address                                      | Note                                         |
| ------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Polymarket CTF Exchange         | `0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e` | version 1, no builder codes                  |
| Polymarket NegRisk CTF Exchange | `0xc5d563a36ae78145c45a50134d48a1215220f80a` | version 1, no builder codes                  |
| Polymarket exchange (version 2) | `0xe2222d279d744050d28e00520010520000310f59` | verify before recording; emits builder codes |
| ConditionalTokens (CTF)         | `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` | verify before recording                      |

Builder codes exist only on version 2 fills, so version 1 fills appear as "No
builder code". Payouts are read for the same day only; the page does not link a
resolved condition to a market's token because fills carry token ids, not
condition ids.

## Binds (`testril.json`)

| Name      | Function                               | Chain | Params               | Window              |
| --------- | -------------------------------------- | ----- | -------------------- | ------------------- |
| `fills`   | `polymarket_clob.order_fill`           | 137   | `exchanges` (3)      | 96523829 → 96581429 |
| `payouts` | `conditional_tokens.condition_payouts` | 137   | `conditional_tokens` | 96523829 → 96581429 |

`fills` is read in chunks of 2,400 blocks.

## Record real data

Recording needs `tools/prepare` from this repository and a Testril operator
key with a funded channel; neither is part of an extracted demo. From the
repository root:

```sh
cd tools/prepare && npm ci && cp .env.example .env   # set TESTRIL_MCP_URL and TESTRIL_OPERATOR_KEY
node prepare.mjs --plan ../../demos/polymarket-tape   # free estimate
cd ../../demos/polymarket-tape && npm run record
```

`npm run record` replaces `recordings/report.json` with `source: "dev"`, the
bound function ids, job ids and timings. The page then shows "Recorded from
Testril on <date>".
