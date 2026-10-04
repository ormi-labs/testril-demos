# Research notes for the demo plan

**Checked 3 October 2026.** These notes support the [demo plan](../demo-strategy.md). They record metadata responses, inspected code, and published vendor information. Paid operations and competitor performance were not tested. Recheck deployment behavior before implementation and recording.

## Live endpoint

Endpoint: `https://dev.testril.ai/mcp`. The [JSON capture](2026-10-03-live-baseline.json) contains health, catalog, pricing, and configured-chain responses. Calls used the legacy initialization sequence and a returned session ID. The committed capture excludes session identifiers and credentials.

| Call | Result | Still unverified |
| --- | --- | --- |
| `health_check` | `ok: true`, version `0.2.2`, payment `cdp`, 3 functions, 4 bound functions | Paid execution, mainnet settlement, payouts |
| `inspect functions` | `erc20_balance`, `erc20_transfer_volume`, `erc721_owner` | Live output fields and function behavior |
| `inspect pricing` | Materialize $0.00012/block; read base $0.00002; stated block $0.000001; extra block-day $0.000001 | Future generation pricing and total cost of tasks using several functions |
| `inspect chains` | 1, 42161, 84532; finalized heads returned | Archive availability and payment network |
| `tools/list` | Includes bind, materialize, pay_quote, read, provenance, inspect, claim_rewards, ask | Tool behavior; listing `ask` does not establish function generation |

No `pay_quote`, `materialize`, `read`, `claim_rewards`, purchase, or transaction was executed. The payment network must come from an actual quote; data-chain configuration does not establish it. Some examples mention Base Sepolia.

Reported rates were 7,200 blocks/day for Ethereum, 321,190 for Arbitrum, and 43,200 for Base Sepolia. The plan uses these estimates to illustrate cost. Exact dates require block timestamps.

## Core repository

The sibling `testril` checkout changed during research. The initial inspected revision was `9783133b` on `codex/agents-design-acceptance`. The paths below identify the code and documentation read. Verify each relevant behavior on the demo deployment; it may run a different revision.

| Source in `ormi-labs/testril` | Finding | Required action |
| --- | --- | --- |
| `sample-functions/erc20_balance.json` | Exact `balance_raw` and approximate human-unit `balance` | Verify deployed fields; use raw units for reconciliation |
| `sample-functions/erc20_transfer_volume.json` | Per-block count and raw volume, keyed by contract | Add F01 for counterparty queries |
| `crates/specialists/pricing-specialist/src/table.rs` | Rates; 50% read reward and 10% extension shares | Verify configured rates before quoting costs or earnings |
| `README.data-liquidity-framework.md` | Reads with stated ranges, overlapping materialization rights, earning expiry, payout threshold | Display charges, accrued earnings, and payouts separately |
| `README.settlement.md` | Deposits and vouchers; 120-second quotes; delayed withdrawal; separately funded payout signer | Implement this payment sequence and verify reward funding |
| `crates/specialists/provenance-specialist/src/citation.rs:6` and `crates/ask-harness/src/wire.rs:36` | Ordered source blocks, hashes, digest, and sources | Independently recalculate results; a source digest does not verify arithmetic |
| `crates/wire/rest-server/src/rest.rs:205` | REST data route checks coverage but lacks the MCP payment check | Use paid MCP reads in demos and the gateway |
| `crates/wire/rest-server/src/rest.rs:437` | Provenance expansion limited to 10,000 contributing blocks | Partition larger checks using supported operations |
| `README.functions.md` | Designs for native functions, stored state, and dependencies | Verify implementation before relying on these features |
| `progress/native-functions.md` | Initial integration partly implemented; engine, row serving, input references, timestamps, and pricing changes planned | Name missing engine features in function requests |
| `progress/function-library.md` and `references/go-to-market.md` | Static functions follow engine work; runtime generation deferred | Treat new fixed functions as engineering work, separate from generation |
| `crates/functions/golden/DEMAND.md` | Survey of function demand with evidence of use | Consult this when prioritizing functions |

The [initial revision](https://github.com/ormi-labs/testril/tree/9783133b) requires access while the core repository is private. The demo plan includes the assumptions needed to read it without that access.

### Documentation differences to resolve

- Older README text describes JSON authoring; newer plans move toward static functions. Function creation on request remains future work for this plan.
- Architecture documentation describes equal charging across transports, but the inspected REST route lacks the MCP payment check. Test the target release before claiming equal behavior.
- The public [Testril website](https://testril.ai) describes 70+ chains, hundreds of functions, and broad provenance. The inspected endpoint lists three functions and three configured chains. Describe the actual demo deployment on its landing page.
- The claim UI README and newer backend documentation describe different purchase-level earnings fields. Inspect actual responses before attributing earnings to a purchase.

## Code and assets to reuse

- `testril-demo-site`: quote/pay/resume interface and `src/shared/batch-sign.ts`. Reuse the necessary payment code without requiring its shared investor room, Google login, or private-key entry.
- `testril-claim`: integer accounting, wallet/network handling, purchase display, and claims. Verify endpoints and response fields before reuse.
- `testril-website`: olive, cream, muted-gold colors and approved brand assets.

Research did not require secrets or environment credentials.

## Competitor information

These are vendor statements checked on 3 October, not results from comparative testing.

| Source | Published information | Relevance |
| --- | --- | --- |
| [Dune MCP, 3 March 2026](https://dune.com/blog/dune-mcp) | Warehouse access through MCP | MCP availability alone does not distinguish Testril |
| [Dune MPP, 18 March 2026](https://dune.com/blog/dune-stripe-and-tempo-frictionless-onchain-data-access-for-ai-agents) | Stablecoin-funded per-query access | Subscription-free access is already available elsewhere |
| [Allium prices](https://docs.allium.so/ai/machine-payments/endpoints-pricing) | SQL submission $0.01; price endpoints $0.02; wallet endpoints $0.03; SQL results priced separately | Compare Testril's smaller purchases with the specific paid operation |
| [Nansen x402, 16 April 2026](https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai) | Basic calls $0.01; premium calls $0.05 | Useful reads below one cent are a pricing difference to demonstrate |

Testril's proposed design starts with tiny paid operations and adds conventional API access and billing above them. Competitors have added machine payments to existing APIs. The sources establish the published prices, not the vendors' internal architecture. [Dune's MPP documentation](https://docs.dune.com/docs/agents/mpp) describes escrow and vouchers without specifying a minimum query price.

The fifty-read example uses observed Testril rates: 50 × ($0.00002 + 100 × $0.000001) = $0.006. Fifty requests at one-cent or five-cent prices would cost $0.50 or $2.50. Preparing 5,000 distinct blocks adds $0.60. A single contiguous 5,000-block cached read costs $0.00502; separate calls are useful when results determine later scope or allow early stopping.

No equivalent competitor queries were executed. Claims about total savings need equivalent tasks and outputs. These sources also do not establish that competitors lack provenance or reuse mechanisms.

## Technical references

- [x402 EVM batch settlement](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md): escrow, cumulative vouchers, and withdrawal. Test compatibility with Testril's deployed implementation.
- [ERC-20](https://eips.ethereum.org/EIPS/eip-20): balances and Transfer events. Confirm that the selected token's behavior permits reconciliation from those events.
- [Uniswap v3 events](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol) and [pool state](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolState.sol): swap fields and active liquidity. Verify the chosen pool's implementation.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626): assets, shares, conversion methods, and deposit/withdraw actor roles. The [function requirements](../function-briefs.md) define how the demos use them.

## Questions to resolve before implementation

Select the real contracts, ranges, and reference RPC. Verify paid latency and costs, payment network, live output fields, payouts, and F01 support. Agree the generation requirements, generated-code ownership, and gateway rebate policy. Test whether the proposed tasks are useful to prospective customers.

The [implementation plan](../demo-strategy.md) lists the responsible roles and completion criteria for this work.
