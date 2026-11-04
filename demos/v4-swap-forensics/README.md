# v4 swap forensics

One UTC day of Uniswap v4 activity on Ethereum, read for what looks off: the
biggest swaps, JIT liquidity (liquidity added and removed again around a swap in
one block) and sandwiches (the same sender swapping before and after someone
else's swap in the same pool and block, in opposite directions). Each finding
links its transactions on Etherscan. The page proves its numbers with three
cross-checks (below).

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

Working directory: `demos/v4-swap-forensics`

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
headline counts, swaps per hour with JIT and sandwich marks, three tabs (biggest
swaps, JIT events, sandwiches) and three cross-checks. Nothing is saved:
a restart starts empty and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-checks pass on the fixture and fail when a swap's
amounts disagree with its price move, when a swap pays and receives the same
sign, when a swap reports less liquidity than the JIT add before it, when a row
is outside the window or when USDC decimals are wrong. It also checks that a
remove one unit short of the add is not JIT, that two same-direction swaps are
not a sandwich, and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Cross-checks

- Every swap pays one currency and receives the other (amounts have opposite
  signs).
- Price after each swap moves the way its amounts say: selling currency0 never
  raises the pool's price, buying it never lowers it, compared with the pool's
  previous swap.
- A JIT add in range is covered by the liquidity the following swap reports.

All comparisons use raw integer units (BigInt).

## Definitions

- JIT: an add and an exactly negated remove of the same position (sender, pool,
  ticks, salt) in one block, with a swap in that pool between them.
- Sandwich: two consecutive swaps by one sender in one pool and block, in
  opposite directions, with a swap by a different sender between them. The
  sender is whoever called the PoolManager, often a router shared by many
  users, so on real data this finds candidates, not proof of an attack.
- Biggest swaps: ranked by USDC amount, for pools listed in `knownPools` in
  `src/report.mjs`. Other pools still count in JIT and sandwich findings.

## Subjects and window

| Subject                | Address / id                                                         | Note   |
| ---------------------- | -------------------------------------------------------------------- | ------ |
| Uniswap v4 PoolManager | `0x000000000004444c5dc75cb358380d2e3de08a90`                         |        |
| USDC                   | `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`                         |        |
| USDT                   | `0xdac17f958d2ee523a2206206994597c13d831ec7`                         |        |
| ETH/USDC 0.05% pool id | `0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d` | verify |

- Day: 2026-11-01 UTC, blocks `[26316189, 26323365)` (half-open: the end is the
  first block of 2026-11-02), found by binary search over a public RPC.
- Swaps and liquidity changes are read in 300-block chunks (about one hour).

## Binds (`src/report.mjs`)

| Name        | Function                      | Chain | Params         | Window                  |
| ----------- | ----------------------------- | ----- | -------------- | ----------------------- |
| `swaps`     | `uniswap_v4.swap`             | 1     | `manager`      | 26316189 → 26323365     |
| `liquidity` | `uniswap_v4.modify_liquidity` | 1     | `manager`      | 26316189 → 26323365     |
| `tokens`    | `erc20.token_metadata`        | 1     | `tokens`, `by` | 2026-11-01 → 2026-11-02 |
