# Graph economy

One week of The Graph on Arbitrum: which indexers earned the most indexing
rewards, how much of that went to their delegators, how large each indexer's
delegation pool is, and how many query fees the network collected in each Graph
epoch. The page proves its numbers: on every reward row indexer plus delegator
rewards must equal the amount, and per-indexer rewards must add up to the totals.

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

Working directory: `demos/graph-economy`

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
headline numbers, query fees per epoch as bars, a table of the top 10 indexers
by rewards with delegators' cut, delegation pool and delegator yield, and three
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

`npm test` checks the cross-check passes on the fixture and fails when an
indexer share is in whole GRT instead of wei, when a reward log is counted
twice, or when a delegator holds more shares than the pool; and that the
shaped report ranks indexers, takes each pool from the last delegation row,
credits a reward to the indexer its row names and subtracts undelegations.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

All amounts are wei of GRT (18 decimals). The contracts are The Graph Horizon
deployment on Arbitrum One (chain 42161). Each address was read from the
protocol's Controller (`0x0a8491544221dd212964fbb96487467291b2c97e`) with
`getContractProxy`, and the RewardsManager's `subgraphService()` returns the
SubgraphService below.

| Subject         | Address                                      | Note                                    |
| --------------- | -------------------------------------------- | --------------------------------------- |
| HorizonStaking  | `0x00669a4cf01450b64e8a2a20e9b1fcb71e61ef03` | Controller `Staking`                    |
| EpochManager    | `0x5a843145c43d328b9bb7a4401d94918f131bb281` | Controller `EpochManager`               |
| RewardsManager  | `0x971b9d3d0ae3eca029cab5ea1fb0f72c85e6a525` | Controller `RewardsManager`             |
| SubgraphService | `0xb2bb92d0de618878e438b55d5846cfecd9301105` | named by RewardsManager.subgraphService |
| GraphPayments   | `0x7aae8ae011927bc36cb4d0d3e81f2e6e30dae06d` | Controller `GraphPayments`              |

Window: Arbitrum blocks `[518282017, 520415225)`, the seven UTC days
2026-10-26 to 2026-11-01. Both ends were confirmed by block timestamp: 518282017 is 2026-10-26 00:00:00 UTC (its predecessor is 2026-10-25 23:59:59) and 520415225 is 2026-11-02 00:00:00 UTC. Both ends are the first block at or after midnight
UTC (2026-10-26 and 2026-11-02), found by binary search over the public
Arbitrum RPC, not through Testril.

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block not included.

| Name               | Function                         | Chain | Params                                                            | Window                |
| ------------------ | -------------------------------- | ----- | ----------------------------------------------------------------- | --------------------- |
| `indexing-rewards` | `graph_network.indexing_rewards` | 42161 | `rewards_manager`, `subgraph_service`, `staking`, `epoch_manager` | 518282017 → 520415225 |
| `delegation`       | `graph_network.delegation`       | 42161 | `staking`, `epoch_manager`                                        | 518282017 → 520415225 |
| `query-fees`       | `graph_network.query_fees`       | 42161 | `staking`, `subgraph_service`, `graph_payments`, `epoch_manager`  | 518282017 → 520415225 |

Each bind is read in chunks of 100000 blocks.
