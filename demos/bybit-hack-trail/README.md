# Bybit Hack Trail

Follows the stolen funds of the February 2025 Bybit hack, hop by hop, from publicly attributed wallets: a hop graph, an hourly ETH balance line per wallet, a wallet table, and a cross-check of the numbers. The page states only what the chain shows.

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

Working directory: `demos/bybit-hack-trail`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws a hop
graph of at most 10 wallets, six balance lines, a wallet table and the
cross-check. Nothing is saved: a restart starts empty and the next fetch reads
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

`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report and its passed cross-check. The fixture lives in `test/` and is
never shown on the page.

## Subjects and window

Ethereum, the eight fixed UTC days 2025-02-21T00:00:00Z to 2025-03-01T00:00:00Z (the hack was 2025-02-21). The window is history, so it does not follow the press. Tokens: stETH, mETH, cmETH.

| Wallet             | Address                                      | Note                        |
| ------------------ | -------------------------------------------- | --------------------------- |
| Bybit cold wallet  | `0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4` | Source of the funds; verify |
| Exploiter          | `0x47666fab8bd0ac7003bce3f5c3585383f09486e2` | Publicly attributed; verify |
| Wallet 0xa4b2…449e | `0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e` | Verify before fetching      |
| Wallet 0xbdd0…9516 | `0xbdd077f651ebe7f7b3ce16fe5f2b025be2969516` | Verify before fetching      |
| Wallet 0x0fa0…6d2e | `0x0fa09c3a328792253f8dee7116848723b72a6d2e` | Verify before fetching      |
| Wallet 0x1542…0d04 | `0x1542368a03ad1f03d96d51b414f4a2d6d2fe0d04` | Verify before fetching      |

Token addresses (verify): stETH `0xae7ab96520de3a18e5e111b5eaab095312d7fe84`, mETH `0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa`, cmETH `0xe6829d9a7ee3040e1276fa75293bde931859e8fa`.

## Binds

Declared in `src/report.mjs`, one trio per wallet.

| Bind                                    | Function                                        | Window                                                                           |
| --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `transfers-<wallet>-<day>-<hour>` (144) | `erc20.wallet_transfers`, the three tokens      | one segment: 00:00-12:00, 12:00-14:00, 14:00-24:00 UTC of each of the eight days |
| `token-balance-<wallet>` (6)            | `erc20.token_balance` by hour, the three tokens | 2025-02-21T00:00:00Z to 2025-03-01T00:00:00Z                                     |
| `balance-<wallet>` (6)                  | `native.balance` by hour                        | 2025-02-21T00:00:00Z to 2025-03-01T00:00:00Z                                     |

A transfer row carries its block, not a time, so a transfer's place in time is the bind it was read in. The segment from 12:00 to 14:00 UTC stands alone because it holds Lido's daily stETH rebase.

## Cross-check

`check` in `src/check.mjs` uses BigInt throughout and throws on a failure:

- A transfer is keyed by transaction and log index, so one read from both its sender's and recipient's wallet counts once; a repeat inside one wallet fails.
- A transfer between two trail wallets must appear, identical, on both sides.
- A wallet's token balance, read at the last block of the last hour of each segment, changes from one segment to the next by exactly the wallet's transfers in the later segment (inflows minus outflows, per token). stETH may differ by 2 wei per transfer for share rounding, plus up to 0.02% of the balance in the 12:00 to 14:00 UTC segment, which holds the rebase. The first segment's balance is the starting point.
- Balance rows must lie inside the hour window, once per hour and token.

Native ETH moves emit no ERC-20 transfer, so hourly ETH balances are only charted and window-checked, not reconciled. The roughly 401,000 ETH taken in the hack was native ETH and is not in the transfers; the headline counts stETH, mETH and cmETH separately.
