# Omen markets

Prediction markets on Gnosis Chain for 30 days: every Omen market created, the
buys and sells on each, the funding added, and the Reality.eth answers that
settle questions. The page ranks markets by trade volume and lists the latest
answer to each question. It proves its numbers: every trade and funding event
must be on a listed market, every sell must be covered by buys of the same
outcome, no fee may exceed its trade, and no answer may finalize before it was
given.

Reality.eth answers are keyed by question id, and none of the four functions
links a market to its question, so answers are listed beside the markets, not
joined to them.

**The shipped recording is synthetic.** `recordings/report.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`tools/prepare` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/omen-markets`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a bar chart of the ten busiest
markets, a table of markets, a table of settling answers, and three passed
cross-checks.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a trade
for an unlisted market, buys read as sells, a fee larger than its trade, and an
answer that finalizes before it was given, and that the server returns the
shaped report. `npm run test:browser` writes `docs/screenshot-desktop.png`.
`npm run fixture` regenerates the synthetic recording.

## Subjects and window

Window: Gnosis blocks `[48558286, 49062480)`, the first block at or after
2026-10-03T00:00Z up to the first block of 2026-11-02 (30 days ending
2026-11-01), found by binary search over the public RPC
gnosis-rpc.publicnode.com.

| Subject                            | Address                                      | Note                    |
| ---------------------------------- | -------------------------------------------- | ----------------------- |
| Omen FPMM deterministic factory    | `0x9083a2b699c0a4ad06f63580bde2635d26a3eef0` |                         |
| Conditional Tokens                 | `0xceafdd6bc0bef976fdcd1112955828e00543c0ce` |                         |
| Reality.eth (Realitio) on Gnosis   | `0x79e32ae03fb27b07c89c0c568f80287c01ca2e57` | verify before recording |
| wxDAI (collateral of most markets) | `0xe91d153e0b41518a2ce8dd3d7944fa863463a97d` |                         |

All three contracts have code on Gnosis; only the Reality.eth address is
unconfirmed as the instance Omen uses.

## Binds (`testril.json`)

Windows are half-open: the end is the first block not included.

| Name        | Function           | Chain | Params                          | Window              |
| ----------- | ------------------ | ----- | ------------------------------- | ------------------- |
| `markets`   | `omen.market_list` | 100   | `factory`, `conditional_tokens` | 48558286 → 49062480 |
| `trades`    | `omen.trade`       | 100   | `market_list`                   | 48558286 → 49062480 |
| `liquidity` | `omen.liquidity`   | 100   | `market_list`                   | 48558286 → 49062480 |
| `answers`   | `realitio.answer`  | 100   | `realitio`                      | 48558286 → 49062480 |

`trades`, `liquidity` and `answers` are read in chunks of 20,000 blocks.

## Record real data

Recording needs `tools/prepare` from this repository and a Testril operator
key with an existing funded channel (it signs vouchers only and never
deposits); neither is part of an extracted demo. From the repository root:

```sh
cd tools/prepare && npm ci && cp .env.example .env   # set TESTRIL_MCP_URL and TESTRIL_OPERATOR_KEY
node prepare.mjs --plan ../../demos/omen-markets   # free estimate
cd ../../demos/omen-markets && npm run record
```

`npm run record` replaces `recordings/report.json` with `source: "dev"`, the
bound function ids, job ids and timings. The page then shows "Recorded from
Testril on <date>".
