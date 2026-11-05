# New venue flow

Daily volume per token for two newer venues over eight days: the 1inch Aqua
registry on Ethereum and Base, and a Tessera swap contract on Base. Each venue
gets one bar chart per token (small multiples, because token amounts have
different scales and cannot share an axis), with a table of window totals. The page proves
its numbers: counts and amounts are non-negative integers, no token-day is
counted twice, every day lies in the window, and every row has a positive count
and amount (a row exists only when something moved).

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

Working directory: `demos/new-venue-flow`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws three
headline counts, a bar chart per token for each of the three venues, a table of
window totals, and three cross-checks. Nothing is saved: a restart starts
empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

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
tokens are scaled apart.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- The eight UTC days before the day of the press (`from_time` eight days before
  today 00:00 UTC, `to_time` today 00:00 UTC); the end is not included.
- Amounts are raw token units, never priced, so each token has its own scale.
  Tokens missing from the table in `src/report.mjs` show as a shortened address
  in raw units.

| Subject                                   | Address                                      | Note                                                                                      |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1inch Aqua registry (same on both chains) | `0x499943e74fb0ce105688beee8ef2abec5d936d31` | verify                                                                                    |
| Tessera swap contract on Base             | `0x55555522005bcae1c2424d474bfd5ed477749e3e` | same address on Base, BNB and Robinhood; not on Ethereum, so Tessera has no Ethereum bind |

## Binds (`src/report.mjs`)

| Name            | Function                 | Chain | Params                    | Window         |
| --------------- | ------------------------ | ----- | ------------------------- | -------------- |
| `aqua-ethereum` | `aqua.push_volume`       | 1     | `swap.registry`, `by`     | 8 days → today |
| `aqua-base`     | `aqua.push_volume`       | 8453  | `swap.registry`, `by`     | 8 days → today |
| `tessera-base`  | `tessera_v.token_volume` | 8453  | `swap.swap_address`, `by` | 8 days → today |
