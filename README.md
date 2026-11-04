# Testril demos

Small, runnable demos showcasing [Testril](https://testril.ai).

MCP server: `https://dev.testril.ai/mcp`

## Demos

| Demo                                            | Run                                                 | Status                                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Move Money](demos/treasury-analysis/README.md) | `cd demos/treasury-analysis && npm ci && npm start` | Mock or live Base Sepolia: move USDC between three wallets using their full live balances, inspect balance and transfer evidence, track Testril costs, replay, reset, and download the source.                                                |
| [Pool Volume](demos/pool-volume/README.md)      | `cd demos/pool-volume && npm ci && npm start`       | Initial local Testril/Allium comparison: exact hourly pool volumes, recording playback, and visitor-wallet payment flows. No measured recordings yet; paid vendor verification and prepared coverage are required before enabling fresh runs. |

Preview the Pool Volume layout example on [desktop](docs/screenshots/pool-volume-example-desktop.png) and [mobile](docs/screenshots/pool-volume-example-mobile.png). The example uses invented data and includes no benchmark timings or spending claims.

The interface follows Testril’s approved derivative style guide. It runs locally with Node.js 22.13+ on macOS or Linux. Preview the landing screen on [desktop](docs/screenshots/treasury-landing-desktop.png) and [mobile](docs/screenshots/treasury-landing-mobile.png), the [transfer replay](docs/screenshots/treasury-desktop.png), and the [provenance modal](docs/screenshots/treasury-provenance-desktop.png).

Mock mode simulates Arbitrum transactions, Testril reads, payment charges, and source evidence; it needs no credentials. Live mode uses Base Sepolia, local signing, real test USDC transfers, and paid MCP reads. It uses the full balances in the three demo wallets, shares one persistent session across tabs, and enforces separate charge and escrow caps. See the demo README for setup. `sub-cent-reads` and `paid-reader` remain planned independent downloads.

## Data demos

Each of these opens with a **Fetch from Testril** button and no data. Pressing it has the demo's server bind, index and read its functions on Testril, paid from the usage credits of the key in `TESTRIL_PAYER_KEY`, while the page shows a progress bar per bind. Then it draws the report and its cross-check. Nothing is saved: a restart starts empty and the next fetch reads again. Without the key the button is disabled.

### Morning brief

| Demo                                                             | Shows                                                                                            | Run                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [Stablecoin supply](demos/stablecoin-supply/README.md)           | USDT and USDC daily supply for a month, then one day of USDC mints, burns and top transfer edges | `cd demos/stablecoin-supply && npm ci && npm start`      |
| [Exchange tide](demos/exchange-tide/README.md)                   | Hourly USDT, USDC and ETH held by six exchanges' listed wallets over a week                      | `cd demos/exchange-tide && npm ci && npm start`          |
| [v4 swap forensics](demos/v4-swap-forensics/README.md)           | One day of Uniswap v4 swaps on Ethereum: biggest swaps and JIT liquidity                         | `cd demos/v4-swap-forensics && npm ci && npm start`      |
| [ETH staking scoreboard](demos/eth-staking-scoreboard/README.md) | Daily staked ether for a quarter: Lido, wBETH, EigenLayer strategies and stMATIC                 | `cd demos/eth-staking-scoreboard && npm ci && npm start` |
| [Oracle vs pool](demos/oracle-vs-pool/README.md)                 | Hourly Uniswap v4 ETH/USDC price next to the Chainlink ETH/USD feed, with the gap and heartbeats | `cd demos/oracle-vs-pool && npm ci && npm start`         |

### Event replays

| Demo                                                       | Shows                                                                                 | Run                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [USDC depeg replay](demos/usdc-depeg-replay/README.md)     | Chainlink USDC/USD for every hour of 10-14 March 2023 next to USDC burned and minted  | `cd demos/usdc-depeg-replay && npm ci && npm start`   |
| [Bybit hack trail](demos/bybit-hack-trail/README.md)       | Stolen funds from the February 2025 Bybit hack, hop by hop through attributed wallets | `cd demos/bybit-hack-trail && npm ci && npm start`    |
| [V4 hook leaderboard](demos/v4-hook-leaderboard/README.md) | Which Uniswap v4 hooks carry a week of swap volume on Ethereum                        | `cd demos/v4-hook-leaderboard && npm ci && npm start` |

### More demos

| Demo                                                           | Shows                                                                                      | Run                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [DAO treasuries](demos/dao-treasuries/README.md)               | Daily holdings of the Uniswap, ENS and Arbitrum DAO treasuries                             | `cd demos/dao-treasuries && npm ci && npm start`        |
| [DEX venue share](demos/dex-venue-share/README.md)             | Daily share of ETH/USDC and wstETH/ETH volume across Uniswap v2/v3/v4, Curve and Fluid     | `cd demos/dex-venue-share && npm ci && npm start`       |
| [Lending board](demos/lending-board/README.md)                 | Aave v3 rates, utilization, liquidations and flash loans, plus idle USDC                   | `cd demos/lending-board && npm ci && npm start`         |
| [V4 tick liquidity histogram](demos/v4-tick-heatmap/README.md) | Liquidity by price for one Uniswap v4 ETH/USDC pool, rebuilt from every tick               | `cd demos/v4-tick-heatmap && npm ci && npm start`       |
| [NFT collection day](demos/nft-collection-day/README.md)       | One day of a blue-chip ERC-721 collection: mints, trades per hour and holder concentration | `cd demos/nft-collection-day && npm ci && npm start`    |
| [ENS name biography](demos/ens-name-biography/README.md)       | Every owner, resolver, address, registration and renewal of two famous ENS names           | `cd demos/ens-name-biography && npm ci && npm start`    |
| [Graph economy](demos/graph-economy/README.md)                 | A week of The Graph on Arbitrum: indexing rewards, delegator share and query fees          | `cd demos/graph-economy && npm ci && npm start`         |
| [Reality.eth questions](demos/reality-eth-questions/README.md) | 30 days of Reality.eth v3 questions and answers on Ethereum and Gnosis                     | `cd demos/reality-eth-questions && npm ci && npm start` |
| [Wallet lookup](demos/wallet-lookup/README.md)                 | A wallet's ENS name, ETH balance and last seven days of ERC-20 transfers                   | `cd demos/wallet-lookup && npm ci && npm start`         |
| [New venue flow](demos/new-venue-flow/README.md)               | Daily per-token volume on 1inch Aqua (Ethereum, Base) and Tessera (Base)                   | `cd demos/new-venue-flow && npm ci && npm start`        |
| [Polymarket tape](demos/polymarket-tape/README.md)             | One day of Polymarket fills on Polygon: whale tape, hourly odds and builder volume         | `cd demos/polymarket-tape && npm ci && npm start`       |
| [Omen markets](demos/omen-markets/README.md)                   | 30 days of Omen prediction markets on Gnosis: trades, liquidity and answers                | `cd demos/omen-markets && npm ci && npm start`          |
| [Flap launchpad](demos/flap-launchpad/README.md)               | Flap launchpad tokens on BSC ranked by eight days of BNB volume                            | `cd demos/flap-launchpad && npm ci && npm start`        |
| [Pons graduations](demos/pons-graduations/README.md)           | Pons launch funnel on Robinhood Chain: curve launches, graduations and fee sweeps          | `cd demos/pons-graduations && npm ci && npm start`      |
| [Kuru order book](demos/kuru-orderbook/README.md)              | Kuru markets on Monad ranked by taker volume, with taker fees and maker rebates            | `cd demos/kuru-orderbook && npm ci && npm start`        |
| [Hooks across DEXes](demos/hooks-across-dexes/README.md)       | Hooked vs hookless daily volume on PancakeSwap Infinity CL/Bin and Uniswap v4 on BSC       | `cd demos/hooks-across-dexes && npm ci && npm start`    |
| [Aerodrome Slipstream](demos/aerodrome-slipstream/README.md)   | Every Aerodrome Slipstream pool on Base ranked by daily volume                             | `cd demos/aerodrome-slipstream && npm ci && npm start`  |

## Plans

The [two-page brief](docs/demo-summary.pdf) ([Markdown](docs/demo-summary.md)) and [detailed plan](docs/demo-strategy.md) describe the broader demo series. [Download specifications](docs/demo-deliverables.md) describe proposed applications and exports; the [treasury sketch](docs/treasury-preview.svg) is an earlier design. [Function requirements](docs/function-briefs.md) and the [first-release build specification](docs/specs/first-release-data-functions.md) describe backend work for live integration.

The runnable demo’s README describes its current behavior; these planning documents cover future capabilities. To refresh the brief PDF, install `reportlab` and run `python docs/render_summary.py`.

Client setup, live recovery, and a code map are included in the
[treasury demo documentation](demos/treasury-analysis/README.md). Its folder is
self-contained and can be downloaded and run independently of these plans.

## Contributing

Read [AGENTS.md](AGENTS.md). Keep each demo self-contained, readable, and simple. Its README should explain what it shows, how to run it, and what to expect.

Hosted demos follow the [demo and harness failure contract](docs/specs/demo-harness-contract.md).
It defines ownership, structured failures, adapter validation, safe diagnostics,
and the integration checks required for each new demo. Each demo also documents
its supported failures within its own downloadable source.

## Production deployment

Production uses Cloudflare Workers Builds, connected to the private
`testril-demo-harness` repository. Harness pushes to `main` start its native
build. Public demo pushes call a Cloudflare Deploy Hook through the
[request workflow](https://github.com/ormi-labs/testril-demos/actions/workflows/deploy.yml).
That workflow reports whether the request succeeded; Cloudflare's build history
reports the checks and deployment result.

The native build selects the latest demo commit on `main`, tests both repositories,
deploys the Worker and assets, and verifies that production reports the tested
commit hashes at [the health endpoint](https://demos.testril.si/healthz).
Cloudflare manages deployment credentials. Repository administrators configure
only `CLOUDFLARE_DEPLOY_HOOK` here, containing the harness's `main` deploy-hook URL.
Downloaded demos need no deployment credentials.

## Status

This repository is public under the [MIT license](LICENSE). Move Money runs
locally and at [demos.testril.si/move-money](https://demos.testril.si/move-money).
