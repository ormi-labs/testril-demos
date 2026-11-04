# New venue flow

Daily volume per token for two newer venues over eight days: the 1inch Aqua
registry on Ethereum and Base, and a Tessera swap contract on Base. Each venue
gets one bar chart per token (small multiples, because token amounts have
different scales and cannot share an axis), with a table of window totals. The page proves
its numbers: counts and amounts are non-negative integers, no token-day is
counted twice, every day lies in the window, and every row has a positive count
and amount (a row exists only when something moved).

**The shipped recording is synthetic.** `recordings/synthetic.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`npm run record` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/new-venue-flow`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, three headline counts, a bar chart per token for each of the
three venues, a table of window totals, and three passed cross-checks.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a
negative amount, a zero count or amount, a token-day counted twice, a day outside the window, and an
amount in decimal instead of raw units, and that amounts of 6- and 18-decimal
tokens are scaled apart. `npm run test:browser` writes
`docs/screenshot-desktop.png`. `npm run fixture` regenerates the synthetic
recording.

## Subjects and window

- UTC days `[2026-10-25, 2026-11-02)`: 25 October to 1 November. The end day is
  exclusive on the daemon.
- Amounts are raw token units, never priced, so each token has its own scale.
  Tokens missing from the table in `src/report.mjs` show as a shortened address
  in raw units.

| Subject                                   | Address                                      | Note                                                                                      |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1inch Aqua registry (same on both chains) | `0x499943e74fb0ce105688beee8ef2abec5d936d31` | verify before recording                                                                   |
| Tessera swap contract on Base             | `0x55555522005bcae1c2424d474bfd5ed477749e3e` | same address on Base, BNB and Robinhood; not on Ethereum, so Tessera has no Ethereum bind |

## Binds (`testril.json`)

| Name            | Function                 | Chain | Params                    | Window                  |
| --------------- | ------------------------ | ----- | ------------------------- | ----------------------- |
| `aqua-ethereum` | `aqua.push_volume`       | 1     | `swap.registry`, `by`     | 2026-10-25 → 2026-11-02 |
| `aqua-base`     | `aqua.push_volume`       | 8453  | `swap.registry`, `by`     | 2026-10-25 → 2026-11-02 |
| `tessera-base`  | `tessera_v.token_volume` | 8453  | `swap.swap_address`, `by` | 2026-10-25 → 2026-11-02 |

## Record real data

The demo records itself. It needs a private key whose address holds Testril
usage credits; it pays with vouchers against those credits, so the wallet
needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to record    |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

Working directory: `demos/new-venue-flow`

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
