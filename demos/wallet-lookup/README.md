# Wallet lookup

Pick a wallet and see its ENS name, ETH balance and the last seven days of
ERC-20 transfers (USDC, USDT, DAI, WETH) on Ethereum. The page proves its
numbers: every listed transfer must name the wallet as sender or recipient, and
every wallet must have an ENS name and a balance.

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

Working directory: `demos/wallet-lookup`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws a wallet
picker, ENS name, ETH balance and transfer count, a chart of incoming and
outgoing transfers per day, the newest 25 transfers, and three passed
cross-checks. Nothing is saved: a restart starts empty and the next fetch reads
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

`npm test` checks the cross-check passes on the fixture and fails when a
transfer does not involve the wallet, an ENS name is empty, or a transfer lies
outside the window, and that raw units display at their decimals.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- Transfers: seven days of 7,200 blocks, `[26272965, 26323365)`, ending at the
  first block of 2026-11-02 (estimate, verify).
- Balance and ENS name: read at block 26323364, the last block of 2026-11-01 (estimate, verify).
- ENS registry `0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e`.
- Tokens: USDC `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`, USDT
  `0xdac17f958d2ee523a2206206994597c13d831ec7`, DAI
  `0x6b175474e89094c44da98b954eedeac495271d0f`, WETH
  `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`.

| Wallet      | Address                                      | Note   |
| ----------- | -------------------------------------------- | ------ |
| vitalik.eth | `0xd8da6bf26964af9d7eed9e03e53415d37aa96045` |        |
| nick.eth    | `0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5` | verify |
| brantly.eth | `0x983110309620d911731ac0932219af06091b6744` | verify |

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block not included.

| Name                | Function                 | Chain | Params              | Window              |
| ------------------- | ------------------------ | ----- | ------------------- | ------------------- |
| `ens-vitalik`       | `ens.primary_name`       | 1     | `registry, address` | 26323364 → 26323365 |
| `ens-nick`          | `ens.primary_name`       | 1     | `registry, address` | 26323364 → 26323365 |
| `ens-brantly`       | `ens.primary_name`       | 1     | `registry, address` | 26323364 → 26323365 |
| `balance`           | `native.balance`         | 1     | `owners`            | 26323364 → 26323365 |
| `transfers-vitalik` | `erc20.wallet_transfers` | 1     | `wallet, tokens`    | 26272965 → 26323365 |
| `transfers-nick`    | `erc20.wallet_transfers` | 1     | `wallet, tokens`    | 26272965 → 26323365 |
| `transfers-brantly` | `erc20.wallet_transfers` | 1     | `wallet, tokens`    | 26272965 → 26323365 |

`transfers-*` are read in chunks of 7,200 blocks.
