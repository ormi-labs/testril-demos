# Pons graduations

A launch funnel for the Pons token launch factory on Robinhood Chain: how many
tokens launched on bonding curves, how many graduated into Uniswap v4 pools,
and how the fees swept from those pools split between creator, buyback and
protocol. The page proves its numbers: every graduated token must be a launched
token, every token with swept fees must have graduated, every traded curve must
have been launched, and each token's fee rows must carry the same sweep count and
creator, buyback and protocol amounts as the sum of its individual sweeps.

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

Working directory: `demos/pons-graduations`

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
headline numbers, a launched / graduated / fees-swept funnel, fees swept per
day, a table of the twelve pools with the most fees, and three cross-checks. Nothing is saved: a restart starts empty and the next fetch reads
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

`npm test` checks the cross-check passes on the fixture and fails when a token
graduated without being launched, when fees are swept from a pool that never
graduated, when a fee amount is in ether instead of raw units, when fee rows
move an amount from creator to protocol, when a sweep is missing, and when a
sweep is counted twice, and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

Chain id `4663` is Robinhood Chain mainnet. The factory, hook and position
manager come from testril's DefiLlama card for Pons v2. The `pool_manager` param of
`pons.graduated_pool_list` is the Uniswap v4 position manager, whose
`positionInfo` turns a graduated position into its pool id.

| Subject                                    | Address                                      | Note                                         |
| ------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| Pons launch factory                        | `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` | deployed at block 26,841,846                 |
| Pons meme hook                             | `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044` | the only `PoolFeesSwept` emitter used        |
| Uniswap v4 position manager (positionInfo) | `0x58daec3116aae6d93017baaea7749052e8a04fa7` | `pool_manager` of `pons.graduated_pool_list` |

- Period: the 91 UTC days before the day of the press (`from_time` 91 days before
  today 00:00 UTC, `to_time` today 00:00 UTC). Every bind covers exactly this
  period, so the cross-check compares like with like.
- Amounts are raw wei of the pair token, which is the native coin (ETH).

## Binds (`src/report.mjs`)

Windows end at 00:00 UTC on the day of the press; the end is not included.

| Name             | Function                   | Chain | Params                                        | Window          |
| ---------------- | -------------------------- | ----- | --------------------------------------------- | --------------- |
| `launches`       | `pons.curve_list`          | 4663  | `factory`                                     | 91 days → today |
| `graduations`    | `pons.graduated_pool_list` | 4663  | `factory`, `pool_manager`                     | 91 days → today |
| `curve-volume`   | `pons.curve_volume`        | 4663  | `swap.curve_list`, `by`                       | 91 days → today |
| `pool-fees`      | `pons.pool_fees`           | 4663  | `swap.hook`, `swap.graduated_pool_list`, `by` | 91 days → today |
| `pool-fee-sweep` | `pons.pool_fee_sweep`      | 4663  | `hook`, `graduated_pool_list`                 | 91 days → today |

`pons.pool_fee_sweep` is a fifth bind beyond the four functions the demo is
about. The spec's check that creator, buyback and protocol amounts equal the
sweep total cannot be made because `PoolFeesSwept` emits no total, so the demo
instead cross-checks each token's `pons.pool_fees` sums against its individual
sweeps.
