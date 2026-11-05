# Hooks across DEXes

Daily pool volume on BSC for 2026-10-25 to 2026-11-01 on three pool managers:
PancakeSwap Infinity CL, PancakeSwap Infinity Bin and Uniswap v4. Each pool is
read from its manager's pool list, called hooked when its `hooks` address is
not the zero address, and its volume is split into hooked and hookless. The page
proves its numbers: every traded pool must be in its pool list, have at most
one row per day, and on each day hooked plus hookless must equal the total,
with every pool counted in exactly one class.

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

Working directory: `demos/hooks-across-dexes`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws hooked
share and hook pool counts per DEX, a bar per venue split into hooked and
hookless dollars, a table of up to ten of the largest hook pools, and three
cross-checks. Nothing is saved: a restart starts empty and the next fetch
reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture and fails when a traded
pool is missing from the pool list, a pool is listed twice, a pool has two rows
for one day, a row is outside the window, the legs of a stablecoin pair differ
by more than 1%, a hookless pool has a non-zero hooks_registration, a pool counts
as both or neither of hooked and hookless, and that the report splits hooked from
hookless volume on the stablecoin side of each pool. The server test checks that
a fetch whose rows fail the cross-check still ends done, carrying the failure
and no report view.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

Assumptions to verify on the first real fetch: the 1% leg check applies
only to hookless stablecoin pairs (a hooked pool's swap delta or dynamic fee
can legitimately widen the gap), and for hooked pools `hooks_registration` is
not checked because a hook may register a zero bitmap. Uniswap v4's pool list
has no `hooks_registration`, so that check runs only on PancakeSwap Infinity.

## How dollars are counted

`volume0` and `volume1` are raw amounts of two different tokens, so they cannot
be added across pools. The page counts the stablecoin side only: for a pool with
USDT, USDC, USD1 or FDUSD (all 18 decimals on BSC) it uses that currency's
volume, which is the dollar value traded. Pools with no stablecoin (for example
WBNB/CAKE) add to swap counts but not to dollars.

## Subjects and window

- Volume: the eight UTC days before the day of the press.
- Pool lists: from each manager's creation (CL 2025-03-06T01:28:31Z, Bin
  2025-03-06T01:29:55Z, Uniswap v4 2025-01-21T20:58:44Z, each the timestamp of
  its creation block) to 00:00 UTC on the day of the press, so every pool that
  traded in the window is listed. The creation instants were read off public BSC
  RPC endpoints, not through Testril; verify them before fetching.

| Subject | Address | Note |
| -------------------------------------------- | --------------------------- |
| PancakeSwap Infinity CLPoolManager | `0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b` | verify; created 2025-03-06 |
| PancakeSwap Infinity BinPoolManager | `0xc697d2898e0d09264376196696c51d7abbbaa4a9` | verify; created 2025-03-06 |
| Uniswap v4 PoolManager (BSC) | `0x28e2ea090877bf75740558f6bfb36a5ffee9e9df` | verify; created 2025-01-21 |
| USDT (BSC) | `0x55d398326f99059ff775485246999027b3197955` | |
| USDC (BSC) | `0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d` | |
| USD1 | `0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d` | verify |
| FDUSD | `0xc5f0f7b66764f6ec8c8dff7ba683102295e16409` | verify |

The managers hold bytecode at those addresses on BSC; that they are the
PancakeSwap and Uniswap deployments is not confirmed.

## Binds (`src/report.mjs`)

Windows end at 00:00 UTC on the day of the press; the end is not included.

| Name         | Function                               | Chain | Params       | Window           |
| ------------ | -------------------------------------- | ----- | ------------ | ---------------- |
| `cl-volume`  | `pancakeswap_infinity.cl_pool_volume`  | 56    | `swap`, `by` | 8 days → today   |
| `cl-pools`   | `pancakeswap_infinity.cl_pool_list`    | 56    | `manager`    | creation → today |
| `bin-volume` | `pancakeswap_infinity.bin_pool_volume` | 56    | `swap`, `by` | 8 days → today   |
| `bin-pools`  | `pancakeswap_infinity.bin_pool_list`   | 56    | `manager`    | creation → today |
| `v4-volume`  | `uniswap_v4.pool_volume`               | 56    | `swap`, `by` | 8 days → today   |
| `v4-pools`   | `uniswap_v4.pool_list`                 | 56    | `manager`    | creation → today |

Pool lists are read in chunks of 1,440 hours.
