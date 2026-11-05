# Omen markets

Prediction markets on Gnosis Chain for 30 days: every market the Omen factory
has created (so trades on older markets are listed too), the buys and sells on
each, the funding added, the outcome tokens each market's pool holds, and the
Reality.eth answers that settle questions. The page counts the markets created
in the window and ranks wxDAI markets by trade volume; markets on other
collateral (for example USDC, 6 decimals) are listed apart, never summed into
the wxDAI total. Reality.eth bonds are in native xDAI. It proves its numbers:
every trade, funding event and pool balance must be on a listed market, every
trade's fee must equal the market's fee on its collateral, no answer may
finalize before it was given, and no pool may hold negative outcome tokens. A
pool's balance must also follow its trades: at a block with trades and no
funding, each outcome moves by the collateral less fee paid in (buy) or the
collateral plus fee paid out (sell) on every outcome, and by the tokens traded
on the traded outcome. The scope is the market's pool, not a trader's
holdings: a trader may sell tokens bought before the window or obtained by
splitting a position, so sells are not matched against buys. A balance read
after tokens sent straight to a market can exceed what its trades leave.

Reality.eth answers are keyed by question id, and none of the five functions
links a market to its question, so answers are listed beside the markets, not
joined to them.

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

Working directory: `demos/omen-markets`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws five
headline numbers, a bar chart of the ten busiest markets, a table of markets, a
table of settling answers, and three cross-checks. Nothing is saved: a
restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a trade
for an unlisted market, buys read as sells, a fee off by 10^2, a pool balance
that holds fewer tokens than its trades leave or is negative, and an answer that finalizes
before it was given; that the report counts only window markets, keeps
non-wxDAI collateral out of the wxDAI total and survives an unlisted market;
and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

Window: the 30 UTC days before the day of the press (`from_time` 30 days before
today 00:00 UTC, `to_time` today 00:00 UTC). `markets-created` reads the factory
list over that window to count the markets created in it; `markets` reads it
from the start of the chain (`from_time` 1970-01-01T00:00:00Z, the timestamp of
Gnosis block 0) so every market that can trade in the window is listed.

| Subject                              | Address                                      | Note   |
| ------------------------------------ | -------------------------------------------- | ------ |
| Omen FPMM deterministic factory      | `0x9083a2b699c0a4ad06f63580bde2635d26a3eef0` |        |
| Conditional Tokens                   | `0xceafdd6bc0bef976fdcd1112955828e00543c0ce` |        |
| Reality.eth (Realitio) on Gnosis     | `0x79e32ae03fb27b07c89c0c568f80287c01ca2e57` | verify |
| wxDAI (collateral counted in volume) | `0xe91d153e0b41518a2ce8dd3d7944fa863463a97d` |        |

The factory, Conditional Tokens and wxDAI addresses are the well-known Omen
on Gnosis deployments; only the Reality.eth address is
unconfirmed as the instance Omen uses.

## Binds (`src/report.mjs`)

Windows end at 00:00 UTC on the day of the press; the end is not included.

| Name              | Function            | Chain | Params                          | Window              |
| ----------------- | ------------------- | ----- | ------------------------------- | ------------------- |
| `markets`         | `omen.market_list`  | 100   | `factory`, `conditional_tokens` | chain start → today |
| `markets-created` | `omen.market_list`  | 100   | `factory`, `conditional_tokens` | 30 days → today     |
| `trades`          | `omen.trade`        | 100   | `market_list`                   | 30 days → today     |
| `liquidity`       | `omen.liquidity`    | 100   | `market_list`                   | 30 days → today     |
| `market_state`    | `omen.market_state` | 100   | `market_list`                   | 30 days → today     |
| `answers`         | `realitio.answer`   | 100   | `realitio`                      | 30 days → today     |

`market_state` is a bind the first plan did not list; the check that no pool
holds negative or too few outcome tokens needs it, at the cost of its credits.
`markets` starts at the chain start so it lists every market that can trade in the
window, not only those created in it. `trades`, `liquidity`, `market_state` and
`answers` are read in chunks of 24 hours.
