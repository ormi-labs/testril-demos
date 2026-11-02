# ETH staking scoreboard

Daily staked ether on Ethereum for a quarter: Lido's pooled ether and its V3
stVaults, Binance's wBETH, EigenLayer's strategies, and Lido's stMATIC
shrinking. The page proves its inputs: every series covers every day with raw
integer amounts, stVault ether stays below pooled ether, and the wBETH exchange
rate never falls.

**The shipped recording is synthetic.** `recordings/report.json` is generated
by `test/fixture.mjs` and the page says so in its banner. Record real data with
`tools/prepare` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/eth-staking-scoreboard`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a stacked area of staked ETH by venue,
a stVault growth line, a stMATIC wind-down line, a table of five rows and
three passed cross-checks.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a missing
day, an amount in ether instead of wei, stVault ether above pooled ether and a
falling wBETH rate, and that the server returns the shaped report.
`npm run test:browser` writes `docs/screenshot-desktop.png` (it needs port 4181
free). `npm run fixture` regenerates the synthetic recording.

## Subjects and window

Window: UTC days `[2026-08-03, 2026-11-02)`, each read at its last block, so the
last day is 2026-11-01. EigenLayer's `eigenlayer.strategy_underlying` is sparse:
a strategy has no row before it is whitelisted or while its shares are zero.
EigenLayer amounts are in each strategy's own token units, so the page labels
them "tokens" and keep EigenLayer out of the ETH chart, in the table only.

| Subject                    | Address                                      | Note                    |
| -------------------------- | -------------------------------------------- | ----------------------- |
| Lido stETH                 | `0xae7ab96520de3a18e5e111b5eaab095312d7fe84` |                         |
| Binance wBETH              | `0xa2e3356610840701bdf5611a53974510ae27e2e1` |                         |
| Lido stMATIC               | `0x9ee91f9f426fa633d227f7a9b000e28b9dfd8599` |                         |
| EigenLayer StrategyManager | `0x858646372cc42e1a627fce94aa7a7033e7cf075a` |                         |
| Lido VaultHub              | `0x1d201be093d847f6446530efb0e8fb426d176709` | verify before recording |

`vault_hub_from_block` (24000000) is also a placeholder: verify before
recording. Below it `vault_ether` is 0. The fixture's strategy addresses are
illustrative; real ones come from `eigenlayer.strategy_list`.

## Binds (`testril.json`)

Windows are half-open: the end day is not included.

| Name         | Function                         | Chain | Params                                             | Window                  |
| ------------ | -------------------------------- | ----- | -------------------------------------------------- | ----------------------- |
| `lido`       | `lido.pooled_ether`              | 1     | `steth`, `vault_hub`, `vault_hub_from_block`, `by` | 2026-08-03 → 2026-11-02 |
| `wbeth`      | `wbeth.staked_ether`             | 1     | `wbeth`, `by`                                      | 2026-08-03 → 2026-11-02 |
| `stmatic`    | `lido.pooled_matic`              | 1     | `st_matic`, `by`                                   | 2026-08-03 → 2026-11-02 |
| `eigenlayer` | `eigenlayer.strategy_underlying` | 1     | `strategy_list`, `by`                              | 2026-08-03 → 2026-11-02 |

## Record real data

Recording needs `tools/prepare` from this repository and a Testril operator
key with an existing funded channel (it signs vouchers only and never
deposits); neither is part of an extracted demo. From the repository root:

```sh
cd tools/prepare && npm ci && cp .env.example .env   # set TESTRIL_MCP_URL and TESTRIL_OPERATOR_KEY
node prepare.mjs --plan ../../demos/eth-staking-scoreboard   # free estimate
cd ../../demos/eth-staking-scoreboard && npm run record
```

`npm run record` replaces `recordings/report.json` with `source: "dev"`, the
bound function ids, job ids and timings. The page then shows "Recorded from
Testril on <date>".
