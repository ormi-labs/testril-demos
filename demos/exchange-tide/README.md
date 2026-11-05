# Exchange tide

USDT, USDC and ETH held by listed wallets of six exchanges on Ethereum, hour
by hour for a week: a stacked chart of stablecoins per exchange and a table of
the hours when the most money moved in or out. The page proves its numbers:
for every exchange with several wallets, the total Testril returns must equal
the sum of its wallets in every hour, with no missing, zero or out-of-window
hours.

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

Working directory: `demos/exchange-tide`

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
headline numbers, a stacked area of stablecoins per exchange, a table of the ten
biggest hours in or out, and three cross-checks. Nothing is saved: a
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

`npm test` checks the cross-check passes on the fixture and fails when a total
is only its first wallet, when the two tokens are swapped, when an hour is
missing, when a gap is zero-filled and when an hour is outside the window, and
that the biggest hours are ranked by size and direction.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

- USDT `0xdac17f958d2ee523a2206206994597c13d831ec7` and USDC
  `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`, both 6 decimals.
- Window: the 168 UTC hours before the hour of the press (`from_time` 168 hours
  before the start of the current hour, `to_time` the start of the current hour),
  each read at the hour's last block.
- `erc20.token_balance` returns one total per token per hour for the owners
  named, so each wallet of a multi-wallet exchange also has its own bind to
  check the total against.

| Exchange | Wallet      | Address                                      | Note   |
| -------- | ----------- | -------------------------------------------- | ------ |
| Binance  | Binance 14  | `0x28c6c06298d514db089934071355e5743bf21d60` |        |
| Binance  | Binance 8   | `0xf977814e90da44bfa03b6295a0616a897441acec` |        |
| Coinbase | Coinbase 10 | `0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43` |        |
| Coinbase | Coinbase 4  | `0x3cd751e6b0078be393132286c442345e5dc49699` | verify |
| Kraken   | Kraken 4    | `0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0` | verify |
| Kraken   | Kraken 1    | `0x2910543af39aba0cd09dbb2d50200b3e800a63d2` | verify |
| OKX      | OKX 73      | `0x6cc5f688a315f3dc28a7781717a9a798a59fda7b` | verify |
| Bitfinex | Bitfinex 2  | `0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec` | verify |
| Gemini   | Gemini 1    | `0xd24400ae8bfebb18ca49be86258a3c749cf46853` | verify |

## Binds (`src/report.mjs`)

Every window is the 168 hours ending at the start of the current hour.

| Name               | Function              | Owners                  | Window          |
| ------------------ | --------------------- | ----------------------- | --------------- |
| `binance-total`    | `erc20.token_balance` | 2 owner(s), USDT + USDC | 168 hours → now |
| `binance-owner-1`  | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `binance-owner-2`  | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `binance-native`   | `native.balance`      | 2 owner(s)              | 168 hours → now |
| `coinbase-total`   | `erc20.token_balance` | 2 owner(s), USDT + USDC | 168 hours → now |
| `coinbase-owner-1` | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `coinbase-owner-2` | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `coinbase-native`  | `native.balance`      | 2 owner(s)              | 168 hours → now |
| `kraken-total`     | `erc20.token_balance` | 2 owner(s), USDT + USDC | 168 hours → now |
| `kraken-owner-1`   | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `kraken-owner-2`   | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `kraken-native`    | `native.balance`      | 2 owner(s)              | 168 hours → now |
| `okx-total`        | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `okx-native`       | `native.balance`      | 1 owner(s)              | 168 hours → now |
| `bitfinex-total`   | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `bitfinex-native`  | `native.balance`      | 1 owner(s)              | 168 hours → now |
| `gemini-total`     | `erc20.token_balance` | 1 owner(s), USDT + USDC | 168 hours → now |
| `gemini-native`    | `native.balance`      | 1 owner(s)              | 168 hours → now |

All binds are on chain 1 and read `by: "hour"`. `<exchange>-total` names every
wallet of the exchange; `<exchange>-owner-N` names one. `src/report.mjs` links
owner binds to totals by this naming. Single-wallet exchanges and the native
binds get only the presence, positivity and gap checks, no unit check.
