# Pons graduations

A launch funnel for the Pons token launch factory on Robinhood Chain: how many
tokens launched on bonding curves, how many graduated into Uniswap v4 pools,
and how the fees swept from those pools split between creator, buyback and
protocol. The page proves its numbers: every graduated token must be a launched
token, every token with swept fees must have graduated, every traded curve must
have been launched, and each token's fee rows must carry the same sweep count and
creator, buyback and protocol amounts as the sum of its individual sweeps.

**The shipped recording is synthetic.** `recordings/synthetic.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`npm run record` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/pons-graduations`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a launched / graduated / fees-swept
funnel, fees swept per day, a table of the twelve pools with the most fees, and
three passed cross-checks.

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
`npm run test:browser` writes `docs/screenshot-desktop.png`.
`npm run fixture` regenerates the synthetic recording.

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

- Period: UTC days `[2026-08-03, 2026-11-02)`, from the first day the protocol
  reports. Every bind covers exactly this period, so the cross-check compares
  like with like.
- Block windows: `[26314521, 103783392)`, the first block of 2026-08-03 UTC to
  the first block of 2026-11-02 UTC. The chain makes about 823,950 blocks per
  day (measured on 2026-10-25: blocks [97160853, 97984803)).
- Amounts are raw wei of the pair token, which is the native coin (ETH).

## Binds (`testril.json`)

Windows are half-open: the end is the first block or day not included.

| Name             | Function                   | Chain | Params                                        | Window                  |
| ---------------- | -------------------------- | ----- | --------------------------------------------- | ----------------------- |
| `launches`       | `pons.curve_list`          | 4663  | `factory`                                     | 26314521 → 103783392    |
| `graduations`    | `pons.graduated_pool_list` | 4663  | `factory`, `pool_manager`                     | 26314521 → 103783392    |
| `curve-volume`   | `pons.curve_volume`        | 4663  | `swap.curve_list`, `by`                       | 2026-08-03 → 2026-11-02 |
| `pool-fees`      | `pons.pool_fees`           | 4663  | `swap.hook`, `swap.graduated_pool_list`, `by` | 2026-08-03 → 2026-11-02 |
| `pool-fee-sweep` | `pons.pool_fee_sweep`      | 4663  | `hook`, `graduated_pool_list`                 | 26314521 → 103783392    |

`pons.pool_fee_sweep` is a fifth bind beyond the four functions the demo is
about. The spec's check that creator, buyback and protocol amounts equal the
sweep total cannot be made because `PoolFeesSwept` emits no total, so the demo
instead cross-checks each token's `pons.pool_fees` sums against its individual
sweeps.

## Record real data

The demo records itself. It needs a private key whose address holds Testril
usage credits; it pays with vouchers against those credits, so the wallet
needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to record    |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

Working directory: `demos/pons-graduations`

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
