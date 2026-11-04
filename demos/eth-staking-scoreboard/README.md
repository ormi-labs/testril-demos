# ETH staking scoreboard

Daily staked ether on Ethereum for a quarter: Lido's pooled ether and its V3
stVaults, Binance's wBETH, EigenLayer's strategies, and Lido's stMATIC
shrinking. The page proves its inputs: every series covers every day with raw
integer amounts in wei, Lido's total equals pooled ether plus stVault ether, and
the wBETH exchange rate stays at or above 1 ETH. Two checks are heuristics, not
contract guarantees: stVault ether below pooled ether, and a wBETH rate that
never falls. A real slashing event would fail the page.

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

Working directory: `demos/eth-staking-scoreboard`

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
headline numbers, four line charts (stETH, stVaults, wBETH, stMATIC), each on
its own scale, a table of five rows and four passed cross-checks. Nothing is
saved: a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails on a missing
day, an amount in whole units instead of wei (Lido, wBETH, stMATIC), stVault ether above pooled ether and a
falling wBETH rate, and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report (it needs port 4181 free). The fixture lives in `test/` and is never shown on the page.

## Subjects and window

Window: UTC days `[2026-08-03, 2026-11-02)`, each read at its last block, so the
last day is 2026-11-01. EigenLayer's `eigenlayer.strategy_underlying` is sparse:
a strategy has no row before it is whitelisted or while its shares are zero.
EigenLayer amounts are in each strategy's own token units and cannot be added,
so the page validates them and shows only the number of strategies in the
table.

| Subject                    | Address                                      | Note   |
| -------------------------- | -------------------------------------------- | ------ |
| Lido stETH                 | `0xae7ab96520de3a18e5e111b5eaab095312d7fe84` |        |
| Binance wBETH              | `0xa2e3356610840701bdf5611a53974510ae27e2e1` |        |
| Lido stMATIC               | `0x9ee91f9f426fa633d227f7a9b000e28b9dfd8599` |        |
| EigenLayer StrategyManager | `0x858646372cc42e1a627fce94aa7a7033e7cf075a` |        |
| Lido VaultHub              | `0x1d201be093d847f6446530efb0e8fb426d176709` | verify |

`vault_hub_from_block` (24000000) is also a placeholder: verify before
fetching. Below it `vault_ether` is 0. The fixture uses the real mainnet EigenLayer strategy
addresses for stETH (`0x93c4b944d05dfe6df7645a86cd2206016c51564d`), rETH
(`0x1bee69b7dfffa4e2d53c2a2df135c388ad25dcd2`) and cbETH
(`0x54945180db7943c0ed0fee7edab2bd24620256bc`) with invented amounts; a real
fetch reads them from `eigenlayer.strategy_list`.

## Binds (`src/report.mjs`)

Windows are half-open: the end day is not included.

| Name         | Function                         | Chain | Params                                             | Window                  |
| ------------ | -------------------------------- | ----- | -------------------------------------------------- | ----------------------- |
| `lido`       | `lido.pooled_ether`              | 1     | `steth`, `vault_hub`, `vault_hub_from_block`, `by` | 2026-08-03 → 2026-11-02 |
| `wbeth`      | `wbeth.staked_ether`             | 1     | `wbeth`, `by`                                      | 2026-08-03 → 2026-11-02 |
| `stmatic`    | `lido.pooled_matic`              | 1     | `st_matic`, `by`                                   | 2026-08-03 → 2026-11-02 |
| `eigenlayer` | `eigenlayer.strategy_underlying` | 1     | `strategy_list`, `by`                              | 2026-08-03 → 2026-11-02 |
