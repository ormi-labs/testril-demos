# Research baseline for the demo plan

**Observed 3 October 2026.** This note supports the [strategy](../demo-strategy.md); it is not a product support matrix or a benchmark. Recheck before implementation and recording.

## Live endpoint observations

Endpoint: `https://dev.testril.ai/mcp`. Captured [JSON](2026-10-03-live-baseline.json) contains the actual health, catalog, rate, and configured-chain responses. Calls used the legacy initialize lifecycle and a returned session ID; no session identifier or credential is retained in the committed capture.

| Observation | Result | What this does not establish |
| --- | --- | --- |
| `health_check` | `ok: true`, version `0.2.2`, payment `cdp`, 3 functions, 4 bound functions | Successful paid execution, mainnet settlement, or payout readiness |
| `inspect functions` | `erc20_balance`, `erc20_transfer_volume`, `erc721_owner` | The live field schema or behavior of every function |
| `inspect pricing` | Materialize $0.00012/block; read base $0.00002; stated block $0.000001; extra block-day $0.000001 | Final future pricing, authoring cost for USP 2, or total cost of a multi-function task |
| `inspect chains` | 1, 42161, 84532; finalized heads returned | Arbitrary chain support, historical archive availability, or payment-chain selection |
| `tools/list` | Tools include bind, materialize, pay_quote, read, provenance, inspect, claim_rewards, ask | Every advertised tool works for every question; `ask` is proof of shipping USP 2 |

The payment network was not inferred from the data-chain list. Published examples mention Base Sepolia, but an actual deployment quote must select the payment network. No `pay_quote`, `materialize`, `read`, `claim_rewards`, transaction, or purchase was executed for this research.

Reported chain-rate estimates were 7,200 blocks/day for Ethereum, 321,190 for Arbitrum, and 43,200 for Base Sepolia. They support the strategy's cost illustration; they are not exact timestamp-to-block conversions.

## Core repository evidence

The sibling `testril` checkout was actively evolving during research. The initial inspected revision was `9783133b` on `codex/agents-design-acceptance`; it subsequently advanced. The following paths identify the evidence read. Live deployment observations take precedence over assuming the current checkout is deployed.

| Source in `ormi-labs/testril` | Relevant evidence | Consequence for demos |
| --- | --- | --- |
| `sample-functions/erc20_balance.json` | Exact `balance_raw` alongside approximate human-unit `balance` | Verify deployment; use raw units for reconciliation |
| `sample-functions/erc20_transfer_volume.json` | Per-block count and raw volume, entity keyed by contract | Cannot answer counterparty questions without F01 |
| `crates/specialists/pricing-specialist/src/table.rs` | Current rates; 5,000-basis-point reward and 1,000-basis-point extension shares | Price/reward examples are configuration-dependent |
| `README.data-liquidity-framework.md` | Paid stated reads, eligible overlapping title, earning expiry, lifetime accounting, payout floor | Separate read charge, accrued earnings, and paid-out rewards |
| `README.settlement.md` | Batch deposit/voucher flow; 120-second quote lifetime; delayed withdrawal; separately funded payout signer | Public client must handle Testril's actual flow and surface funding semantics |
| `crates/specialists/provenance-specialist/src/citation.rs:6` and `crates/ask-harness/src/wire.rs:36` | Ordered source blocks, hashes, digest and sources | Source-set consistency is not proof of a numeric calculation |
| `crates/wire/rest-server/src/rest.rs:205` | Data route reads the harness after coverage checks without the MCP payment gate | Paid demos use MCP; gateway requires explicit paid-path review |
| `crates/wire/rest-server/src/rest.rs:437` | Provenance expansion is bounded to 10,000 contributing blocks | Larger evidence bundles need supported partitioned verification |
| `README.functions.md` | Native functions, stored state, dependency composition, lenses described as design | Do not confuse documented design with deployment |
| `progress/native-functions.md` | Seam partly landed; engine, richer serving, input lineage, timestamps, and pricing changes are staged | New function requests must name platform gates |
| `progress/function-library.md` and `references/go-to-market.md` | Static function library ordered after engine/source work; runtime generation deferred | Pre-2 additions are engineering work, not autonomous creation |
| `crates/functions/golden/DEMAND.md` | Existing demand survey distinguishes usage evidence from popularity proxies | Reuse its function-prioritization work; do not claim new market validation from this plan |

Source can be reviewed from the [initial checkout revision](https://github.com/ormi-labs/testril/tree/9783133b); access requires permission while that repository is private. The plan states its assumptions directly so understanding it does not require this checkout.

### Documentation discrepancies requiring launch checks

- The README describes JSON authoring that the newer static-function roadmap plans to remove. The user's product definition controls this plan: function creation is a future release.
- The architecture prose states transport charging parity; the examined REST implementation and README limits still expose an ungated data surface. Do not claim parity until measured on the target release.
- The public [Testril website](https://testril.ai) describes 70+ chains, hundreds of functions, and broad provenance. The inspected endpoint advertises three functions and three configured chains. Those website statements do not prove this deployment's readiness; align the demo landing page with its observed capability manifest.
- The current claim UI README and newer backend documentation differ on purchase-level earnings fields. Inspect actual fields before presenting per-purchase attribution.

These are evidence boundaries, not conclusions that every deployment has the same limits.

## Existing assets worth reusing

- `testril-demo-site`: known quote/pay/resume UI and batch-signing implementation (`src/shared/batch-sign.ts`), plus existing investor-demo behavior. Adapt the narrow payment logic; public examples should not require its Google-login shared room or raw-key entry.
- `testril-claim`: exact integer accounting, wallet/network handling, purchase presentation, sample/live separation, and claim integration. Verify current endpoint configuration and capability before a live earnings handoff.
- `testril-website`: existing olive/cream/gold visual system and approved brand assets. The new demo series should look like Testril and remain readable without the investor site's context.

Only these sources and their public-facing code/docs were read; no secrets or environment credentials were needed.

## Competitive sources

These are primary vendor materials checked on 3 October, not independently measured product comparisons.

| Source | Narrow fact used | Strategic implication |
| --- | --- | --- |
| [Dune MCP, 3 March 2026](https://dune.com/blog/dune-mcp) | Dune exposes its warehouse to agents through MCP | MCP alone is not a differentiator |
| [Dune MPP, 18 March 2026](https://dune.com/blog/dune-stripe-and-tempo-frictionless-onchain-data-access-for-ai-agents) | Stablecoin-funded, per-query agent access | Avoid saying competitors always require subscriptions |
| [Allium pricing](https://docs.allium.so/ai/machine-payments/endpoints-pricing) | SQL submission $0.01; price endpoints $0.02; wallet endpoints $0.03; SQL results priced separately | Published paid units support the sub-cent positioning; SQL submission is not the complete query cost |
| [Nansen x402, 16 April 2026](https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai) | Wallet/market analytics sold through x402; advertised $0.01 and $0.05 tiers | Sub-cent useful purchases are a distinct proposition; verify matched workflows for whole-task savings claims |

The product owner's positioning is that Testril builds around tiny transactions and adds conventional access above them, while rivals add machine payments to existing APIs. The plan adopts this direction. The published rates above support the pricing distinction without establishing every vendor's architecture or a universal minimum. [Dune's MPP documentation](https://docs.dune.com/docs/agents/mpp) describes escrow and vouchers but does not specify a minimum query price; x402 and MPP support alone do not establish economic granularity.

Testril's fifty-read illustration uses its observed rate formula: 50 × ($0.00002 + 100 × $0.000001) = $0.006. The $0.50/$2.50 alternatives model fifty requests at one-cent/five-cent floors. They are not executed competitor benchmarks. Cold preparation of 5,000 distinct blocks of one function adds $0.60. A single contiguous 5,000-block cached read costs $0.00502; selective calls must justify their usefulness through conditional scope or early stopping.

None of these pages establishes absence of rival lineage or reuse mechanisms. Claims of exclusivity, superior accuracy, or whole-task cost advantage need direct comparative evidence.

## Technical primary references

- [x402 EVM batch-settlement scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md): escrow, cumulative vouchers, and withdrawal lifecycle. Testril's deployed subset still needs its own compatibility test.
- [ERC-20](https://eips.ethereum.org/EIPS/eip-20): balance/Transfer vocabulary. Token-specific behavior determines whether an event/balance reconciliation is valid.
- [Uniswap v3 pool events](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol) and [pool state](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolState.sol): swap fields and active-liquidity semantics. Verify a chosen pool's actual implementation.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626): asset/share distinction, conversion methods, and deposit/withdraw actor roles. Cohort definitions and acceptance fixtures in the function brief are proposed demo requirements.

## Remaining unknowns before building

Real case/contract/window selection; paid live latency and complete cost; deployment payment network; exact live field schemas; archival reference access; production payout readiness; F01 compatibility with the present engine; authoring product timeline; generated-code ownership; gateway rebate policy; and first-customer demand.

These unknowns have owners/gates in the strategy. They do not block choosing a portfolio, but they do block filming claims that depend on them.
