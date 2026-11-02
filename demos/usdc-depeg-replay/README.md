# USDC depeg replay

The Chainlink USDC/USD answer for every hour of 10–14 March 2023 on Ethereum,
next to what USDC burned and minted in the same hours, and the addresses that
redeemed the most. The page proves its numbers: in every hour the USDC supply
change must equal mints minus burns from the transfer edges, and the Chainlink
answer must stay between $0.80 and $1.02.

**The shipped recording is synthetic.** `recordings/report.json` is generated
by `test/fixture.mjs` and the page says so in its banner. The dip in it is
invented, not the real March 2023 numbers. Record real data with
`tools/prepare` (below).

![Desktop screenshot](docs/screenshot-desktop.png)

## Prerequisites

- Node.js 22.13 or later

## Run

Working directory: `demos/usdc-depeg-replay`

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it). Expected result: the
synthetic banner, four headline numbers, a timeline of the answer above net
burns per hour, a table of the biggest redeemers, and three passed
cross-checks.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-checks pass on the fixture and fail when a burn is
read as a mint, when supply is in whole dollars instead of raw units, when the
answer is read with the wrong decimals, or when an hour is missing, and that the
server returns the shaped report. `npm run test:browser` writes
`docs/screenshot-desktop.png`. `npm run fixture` regenerates the synthetic
recording.

## Subjects and window

- USDC `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`, 6 decimals.
- Chainlink USDC/USD aggregator `0x8fffffd4afb6115b954bd326cbe7b4ba576818f6`,
  8 decimals. Verify before recording.
- Hours: UTC hours `[2023-03-10T00, 2023-03-15T00)`, read at each hour's last
  block.
- Transfers: blocks `[16794062, 16829610)`, the first block of 2023-03-10T00 up
  to the first block of 2023-03-15T00, so they cover the same 120 hours.
- `src/hour-first-blocks.json` holds the first block of each hour, found by
  binary search over the public RPC ethereum-rpc.publicnode.com. `check` uses
  it to put each transfer edge in its hour.
- ENS registry `0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e`, names read at
  block 16829609, the last block of 2023-03-14.

The first hour has no earlier supply row, so 119 hours are cross-checked.

The 20 named addresses are fixed in `testril.json`, chosen as likely large
USDC movers; some may not have held USDC in March 2023. Redeemers between other
addresses show shortened hex.

| Subject                         | Address                                      | Note                    |
| ------------------------------- | -------------------------------------------- | ----------------------- |
| Circle (USDC issuer)            | `0x55fe002aeff02f77364de339a1292923a15844b8` | verify before recording |
| Binance 14                      | `0x28c6c06298d514db089934071355e5743bf21d60` |                         |
| Binance 8                       | `0xf977814e90da44bfa03b6295a0616a897441acec` |                         |
| Coinbase 10                     | `0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43` |                         |
| Kraken 4                        | `0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0` | verify before recording |
| OKX 73                          | `0x6cc5f688a315f3dc28a7781717a9a798a59fda7b` | verify before recording |
| Bitfinex 2                      | `0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec` | verify before recording |
| Uniswap v3 USDC/WETH 0.05% pool | `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` |                         |
| Uniswap v3 USDC/USDT 0.01% pool | `0x3416cf6c708da44db2624d63ea0aaef7113527c6` |                         |
| Uniswap v4 PoolManager          | `0x000000000004444c5dc75cb358380d2e3de08a90` |                         |
| Uniswap Universal Router        | `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` | verify before recording |
| Curve 3pool                     | `0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7` |                         |
| Aave v3 aEthUSDC                | `0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c` |                         |
| Morpho Blue                     | `0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb` |                         |
| Maker PSM USDC                  | `0x0a59649758aa4d66e25f08dd01271e891fe52199` | verify before recording |
| CoW Protocol settlement         | `0x9008d19f58aabd9ed0d60971565aa8510560ab41` |                         |
| 1inch v6 router                 | `0x111111125421ca6dc452d289314280a0f8842a65` |                         |
| 0x Exchange Proxy               | `0xdef1c0ded9bec7f1a1670819833240f027b25eff` |                         |
| Balancer v2 Vault               | `0xba12222222228d8ba445958a75a0704d566bf2c8` |                         |
| vitalik.eth                     | `0xd8da6bf26964af9d7eed9e03e53415d37aa96045` |                         |

## Binds (`testril.json`)

Windows are half-open: the end is the first block or hour not included.

| Name                           | Function                   | Chain | Params                | Window                        |
| ------------------------------ | -------------------------- | ----- | --------------------- | ----------------------------- |
| `supply`                       | `erc20.token_supply`       | 1     | `tokens`, `by`        | 2023-03-10T00 → 2023-03-15T00 |
| `usdc-edges`                   | `erc20.transfer_edges`     | 1     | `token_address`       | 16794062 → 16829610           |
| `usdc-usd-feed`                | `aggregator.latest_answer` | 1     | `feeds`, `by`         | 2023-03-10T00 → 2023-03-15T00 |
| `ens-circle`                   | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-binance-14`               | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-binance-8`                | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-coinbase-10`              | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-kraken-4`                 | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-okx-73`                   | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-bitfinex-2`               | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-uniswap-v3-usdc-weth`     | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-uniswap-v3-usdc-usdt`     | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-uniswap-v4-pool-manager`  | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-uniswap-universal-router` | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-curve-3pool`              | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-aave-v3-ausdc`            | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-morpho-blue`              | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-maker-psm-usdc`           | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-cow-settlement`           | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-1inch-v6-router`          | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-0x-exchange-proxy`        | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-balancer-v2-vault`        | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |
| `ens-vitalik`                  | `ens.primary_name`         | 1     | `registry`, `address` | 16829609 → 16829610           |

`usdc-edges` is read in chunks of 600 blocks.

## Record real data

Recording needs `tools/prepare` from this repository and a Testril operator
key with an existing funded channel; it only signs vouchers and never deposits.
Neither is part of an extracted demo. From the repository root:

```sh
cd tools/prepare && npm ci && cp .env.example .env   # set TESTRIL_MCP_URL and TESTRIL_OPERATOR_KEY
node prepare.mjs --plan ../../demos/usdc-depeg-replay   # free estimate
cd ../../demos/usdc-depeg-replay && npm run record
```

`npm run record` replaces `recordings/report.json` with `source: "dev"`, the
bound function ids, job ids and timings. The page then shows "Recorded from
Testril on <date>".
