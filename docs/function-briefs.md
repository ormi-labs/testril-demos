# Functions required by the demo series

**Proposed contracts · 3 October 2026**

These are requests to the core Testril team, not functions already shipped. Names are working names to reconcile with the core catalog. See the [strategy](demo-strategy.md) for the customer stories and [baseline](research/baseline.md) for implementation evidence.

## Delivery priorities

1. **First release:** F01 transfer edges and confirmation of exact balance snapshots. Existing transfer volume supports the first payment/earnings demonstration while F01 is built.
2. **Optional DeFi vertical:** F02 swaps and F03 liquidity state, only after confirming native-engine support and customer demand.
3. **Authoring preparation:** F04 vault state and F05a/F05b vault flows provide understandable reference cases. They do not themselves implement function generation.
4. **After USP 2:** G01 and G02 are example computations generated during a session. Shipping them as fixed catalog functions would be useful but would not demonstrate USP 2.

Function additions use the core project's existing build/review process. A missing source primitive, storage shape, dependency, or serving operation is separate platform work with a separate estimate. Do not assume planned native functions, lenses, or compositional provenance are deployed.

## Contract shared by every function

- Bind explicit chain and contract parameters; block windows are half-open `[from_block,to_block)`. Each bound function belongs to one chain.
- Preserve integers in base units and signed deltas without floating-point conversion. Supply token/share decimals as metadata. Never combine amounts of different tokens into an unlabeled total.
- Return an unambiguous entity key, block, field names/types, and function identity/version or definition fingerprint. A new computation must not silently reuse an old identity.
- Provenance must associate the answer with the actual source blocks and dependencies available at that capability level. Per-cell derived lineage remains a platform requirement where noted.
- Empty activity, unavailable history, and incomplete coverage are different outcomes. A quiet window produces a zero aggregate only when coverage is complete. Missing data never becomes a zero.
- List source calls/events, required initial history, supported contract versions, and unsupported behavior. Quote the actual dependency/window work; do not assume one function means one cheap RPC.
- Acceptance includes synthetic edge cases and a short, independently reproduced onchain range. A saved screenshot is not numerical verification.

## E00. Existing functions to verify

| Function | Demo use | Required confirmation |
| --- | --- | --- |
| `erc20_balance` | Opening/closing treasury balance | Live function exposes exact `balance_raw`; decimals known; historical `balanceOf` works at pinned blocks |
| `erc20_transfer_volume` | P0 activity and P2 reusable data | `volume` is summed raw Transfer value; `count` counts events; no counterparty or economic-volume inference |
| `erc721_owner` | Optional claim-right ownership explanation | Correct NFT collection and finalized block; ownership alone does not reconstruct accounting history |

The local balance JSON includes exact `balance_raw` alongside an approximate human-unit field. The live inventory was checked, but the deployed field schema was not. Verify it before committing to reconciliation. If missing, exposing the exact existing call result is the smallest first backend request.

For balance change across `[a,b)`, compare `balanceOf` at blocks `a−1` and `b−1`, not `a` and `b`. A point snapshot is its own one-block materialization/read. Never fetch every intervening balance just to compute two endpoints.

P0 needs no new function: choose each narrow transfer-volume window using the preceding result and a stated stopping rule. Verify coverage for every charged window; distinguish an empty covered window from missing data. Preserve exact sub-cent receipts and compare a bulk read when all required scope is known.

## F01. `erc20_transfer_edges` — first backend request

**Customer question:** Which counterparties explain this treasury's token movement?

**Inputs:** `chain_id`, `token_address`. The supported token is a conventional ERC-20 whose Transfer events reconcile with balance changes for the selected case. Wallet-group selection belongs to the consumer so two customers can reuse the same bound function.

**Sources:** finalized `Transfer(address,address,uint256)` logs for that token, using the [ERC-20 interface](https://eips.ethereum.org/EIPS/eip-20). No price feed, transaction traces, wallet-label service, or lifetime history is required.

**Output grain:** one directed `(from_address,to_address)` edge per block. Measures: exact `amount_raw` summed over matching events and `transfer_count`. Key is `(block_number,from_address,to_address)` within the bound function. A self-transfer remains an explicit edge. Mint/burn edges retain the zero address and are classified explicitly by the client.

**Consumer calculation:** select edges touching a supplied wallet group; classify internal/external/mint/burn; sum inflow, outflow, net movement, and ranked counterparties over the complete window. The same pure reducer powers chart and export. Per-block aggregates cannot produce transaction hashes by inference: show block references, or obtain event witnesses through the independent reference verifier and label that source.

**History:** none before the window. `balanceOf(a−1)` and `balanceOf(b−1)` provide independent reconciliation, not initialization of this event function.

**Capability gate:** confirm current JSON engine can key an entity by two decoded addresses and serve those keys over paid MCP. If yes, this is a small fixed function. If not, it needs the relevant native entity/serving work. Do not deliver it by taking uncharged REST rows behind a nominal paid read.

**Acceptance fixture, all amounts in raw units:**

| Block | Event | Amount |
| --- | --- | ---: |
| 100 | A → B | 100 |
| 100 | B → A | 30 |
| 101 | A → A | 50 |
| 102 | C → A | 20 |

Over `[100,103)`, A has external inflow 50, external outflow 100, and net −50. The self-transfer does not inflate those external totals. Treating A and B as one group makes the two A/B edges internal and leaves external net +20. An opening A balance of 1,000 closes at 950 for this fixture.

Also test repeated identical endpoints in one block, multiple logs in a transaction, zero-value transfers, mint/burn, a completely quiet covered block, amounts above JavaScript's safe integer range, one-block boundaries, and a missing slice. Fetch all pages where pagination applies; a truncated response cannot pass the reconciliation gate.

**Done:** synthetic results match; one real window reconciles exactly or names a token-specific exception; the paid response exposes enough keys/fields to reproduce the result; provenance expands the cited blocks; a second reader reuses the same identity and coverage.

## F02. `uniswap_v3_swaps`

**Customer question:** What trading activity occurred in this pool during the selected interval?

**Inputs:** `chain_id`, `pool_address`, verified supported Uniswap v3 implementation. Resolve `token0`, `token1`, token decimals, and pool fee as versioned metadata.

**Sources:** the pool's `Swap(sender,recipient,amount0,amount1,sqrtPriceX96,liquidity,tick)` events, per the [pool event interface](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol). Preserve signed amount semantics from the pool's perspective. Do not call `sender` or `recipient` the economic trader without additional evidence.

**Output:** one swap keyed by `(transaction_hash,log_index)`, with block number, sender, recipient, signed raw token amounts, square-root price, active liquidity, and tick. Preserve full precision for `sqrtPriceX96` and amounts. A client groups known token legs separately; it does not add both legs into “USD volume.”

**History:** no prior state for events. A full decoded event record and its log identity must be supported by the serving path; this may require the native `once` entity work.

**Acceptance:** both trade directions, multiple swaps per transaction, quiet blocks, duplicate/retried log delivery, signed extrema within supported bounds, and exact match to reference logs. Price presentation follows exact decimal/rational conversion and names token orientation. No multi-pool discovery or external prices in this first version.

## F03. `uniswap_v3_liquidity_state`

**Customer question:** Did this pool's active liquidity and price state change across the incident?

**Inputs:** the same chain, pool, and verified implementation as F02.

**Sources:** historical `liquidity()` and the supported version's `slot0()` at each requested block, per the [pool state interface](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolState.sol). Relevant fields are active liquidity, `sqrtPriceX96`, and tick. These calls share the same pool/block scope.

**Output:** a pool snapshot keyed by block. State what each quantity means: active in-range liquidity is not total deposited assets or total TVL.

**History:** archive state at sampled blocks; no need to reconstruct all positions from deployment. The first demo uses explicit blocks; timestamp sampling requires separately available timestamp support.

**Capability gate:** multiple typed state-call results in one entity and exact signed/unsigned types. If unavailable on the current engine, wait for native functions or explicitly split the supported state reads without claiming the combined function exists.

**Acceptance:** reference calls agree; tick crossings are visible; unavailable archive state fails explicitly; unchanged adjacent snapshots remain distinguishable from absent coverage. Attribution to LP withdrawals additionally needs a mint/burn position-event function. F03 alone establishes the state change, not its cause.

## F04. `erc4626_vault_state`

**Customer question:** What assets and shares did this vault report at these blocks?

**Inputs:** chain, vault address, verified supported ERC-4626 implementation. Pin underlying asset and asset/share decimals.

**Sources:** historical `asset()`, `totalAssets()`, `totalSupply()`, and, when used, `convertToAssets(one_share_unit)`. Use the [ERC-4626 interface](https://eips.ethereum.org/EIPS/eip-4626) as implemented by the chosen vault; keep an ideal conversion distinct from a fee-inclusive deposit or withdrawal preview.

**Output:** block-keyed vault snapshot: raw assets, raw share supply, underlying asset address, decimals, and the explicitly defined conversion result. Do not label an assets/share ratio APY. Empty supply and a reverting call have distinct outcomes.

**History:** historical contract state only. Staged metadata/call dependencies must be supported by the host; do not hide them in an unmetered client fetch.

**Acceptance:** empty vault, deposit/withdraw transition, donated assets, differing share/asset decimals, conversion rounding, and reference call agreement. Avoid claiming a universal vault adapter from one verified implementation.

## F05a / F05b. `erc4626_deposits` and `erc4626_withdrawals`

**Customer question:** Who deposited or withdrew, when, and how much?

**Inputs:** chain and supported vault. **Sources:** the vault's standard Deposit and Withdraw events. Each event family has its own function so independent consumers do not pay for the other's input stream by accident; reuse existing catalog functions if equivalent ones exist.

**Output:** event rows keyed by `(transaction_hash,log_index)` with block, sender, owner, raw assets, raw shares; withdrawal rows also expose receiver. Actor fields retain their actual roles. The client may present both event families together, clearly preserving their source functions.

**History:** none for individual events. A net flow over a selected window does not establish lifetime position or economic ownership of transferable shares.

**Acceptance:** delegated deposit where sender differs from owner; third-party withdrawal receiver; same-block deposit/withdraw; partial withdrawal; multiple logs; decimals; and exact reference-event equality. Full row support, addresses, and source-log identity may require the native engine.

These functions support G1/G2 fixtures. They are also independently useful fixed pre-2 additions if a customer needs vault reporting earlier.

## G01. Generated deposit cohorts by prior holdings

**Definition to create in-session:** group vault Deposit events by the owner's balance of a named ERC-20 at the end of the preceding block, exclude a supplied operational-address set, and emit count/assets/shares per cohort per block.

**Inputs:** chain, vault, balance-token contract, cohort boundary in raw balance-token units, excluded-owner set. Example rule: lower cohort `< threshold`; upper cohort `>= threshold`. Binding new parameters to an already existing computation does not count as creation.

**Sources:** deposit events plus historical `balanceOf(owner)` at `deposit_block−1`. A prior-block balance is a precise, reproducible definition; it is not the owner's immediately pre-transaction balance within the same block.

**Output:** `(block,cohort)` aggregates with exact deposit event count, asset sum, and share sum. Call this event count, not unique depositors. State which asset each number measures. Include citations to deposits and historical balance inputs when the generation platform supports the required lineage.

**Gates:** actual generation/registration, historical dependent calls, typed output, resource limits, validation, versioned identity, and dependency provenance. Native step-5 input lineage or its equivalent is an additional platform requirement, not delivered merely by generating code.

**Acceptance:** boundary equality; excluded owner; sender/owner difference; multiple deposits by one owner; a balance change earlier in the deposit block that must not alter the prior-block cohort; failed historical balance lookup; independent hand-computed reference. Another client can discover and reuse the new function after the creator leaves.

## G02. Generated campaign cohort rule

**Definition to create in-session:** identify owners first depositing within a stated campaign, count a repeat deposit on a later UTC day within seven days, and report withdrawals through a stated observation cutoff. A revised definition creates a new version.

**Inputs:** chain, supported vault, campaign bounds, observation cutoff, explicit owner exclusions, and a precise first-deposit convention: first ever requires complete deployment history; first during the campaign does not imply first ever.

**Sources:** deposit/withdraw functions and verified block timestamps. Track owner state from the declared origin. A UTC day is determined from timestamps, never an estimated blocks-per-day multiplier.

**Output:** cohort membership, eligible observation horizon, repeat-deposit flag, exact observed deposited/withdrawn assets, and censored status. A cohort too young to observe seven days remains censored. Unique addresses are not unique humans.

**Scope restriction:** this first rule measures repeat-deposit behavior and observed cash flows. It does not claim current position value or retained capital when vault shares can be transferred. A genuine retained-capital metric needs share-transfer accounting and an explicit attribution method; request that function separately before changing the label.

**Gates:** stateful native functions, initialized history, timestamp support, dependency reads, safe generated execution, and derived lineage. This is materially more work than G01.

**Acceptance:** midnight boundary, seventh-day cutoff, an owner predating the campaign, immature cohort, withdrawal by a different sender for the same owner, excluded address, share-transfer limitation, missing initial history, and independent reproduction of both rule versions.

## Core-team handoff checklist

For each accepted function, return the final catalog name, parameter/output schema, code/definition identity, supported contracts/chains, history requirements, example bind/read, actual warm/cold quotes, source/provenance behavior, and one reproducible live reference. Record the deployed server version where it becomes available.

A rejected shape should name the missing primitive or serving behavior. The demo then narrows honestly or waits for that dependency. It must not move the computation to an opaque client and continue claiming a newly supported Testril function.
