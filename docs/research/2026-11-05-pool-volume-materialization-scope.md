# Why the pool-volume demo quotes $1,661 for three hours

Investigated 5 November 2026. No payments signed or submitted; no materialization jobs started. Production MCP identifies itself as Testril 0.17.0.

## Finding

The dominant cost is completing the Uniswap v3 factory's pool-creation history, not calculating three hours of one pool's volume. The current catalog takes a factory scope and discovers its pools. It offers no direct-pool scope for this calculation. The demo's `key.pool` filters the read; it does not constrain preparation.

This follows the implemented dependency and pricing rules. It is not evidence of an arithmetic error or duplicate dependency charges. It is a poor scope match for the proposed one-pool comparison with Allium.

Correction to the earlier broad explanation: the dependency planner does not necessarily replay years of swaps. It expands the pool-list dependency to factory creation, while the stateless swap and period-volume nodes can retain the requested report window.

## Live evidence

Endpoint: `https://api.testril.si/mcp`. Data chain: Ethereum, `chain_id: 1`. Factory: `0x1f98431c8ad98523631ae4a59f267346ea31f984`. Displayed pool: `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`.

The binding is:

```json
{
  "function_slug": "uniswap_v3.pool_volume",
  "chain_id": 1,
  "params": {
    "by": "hour",
    "swap": {
      "pool_list": {
        "factory": "0x1f98431c8ad98523631ae4a59f267346ea31f984"
      }
    }
  }
}
```

Its bound function ID is `sha256:432d9621f6fe94e7e31fe7c9b78824674a237bfcc214554e78ad8c2c2eba12dd`.

For `[2026-10-17T12:00:00Z, 2026-10-17T15:00:00Z)`, three independently requested unpaid quotes were identical:

| Function                         | Billable hole-blocks | Rate per block | Quoted USDC |
| -------------------------------- | -------------------: | -------------: | ----------: |
| `uniswap_v3.pool_list`           |           13,843,410 |       $0.00012 | $1,661.2092 |
| `uniswap_v3.swap`                |           13,843,410 |       $0.00012 | $1,661.2092 |
| `uniswap_v3.pool_volume`, hourly |           13,843,410 |       $0.00012 | $1,661.2092 |

All three inspected bound functions had empty materialized coverage and no active jobs. Each quote contained one `materialize_blocks` line, with no extra retention charge. Quotes offered Base mainnet native USDC. These are offers, not settled costs or measurements of execution.

Shortening the report to `[12:00, 13:00)` on the same date still quoted 13,842,812 blocks and $1,661.13744. Removing two hours saved only 598 billable blocks, or $0.07176. The historical prerequisite dominates the amount.

Keeping the original end but moving the start to `14:00` quoted the original 13,843,410 blocks and $1,661.2092 unchanged. Shortening the requested window does not remove the pool-list prerequisite.

## Source trace

Reviewed current upstream `main` at [3b3d84484783c59a78d3278c21697f2879b517c8](https://github.com/ormi-labs/testril/commit/3b3d84484783c59a78d3278c21697f2879b517c8), whose workspace version is also 0.17.0. This is corroborating source evidence; matching version strings do not independently establish production's exact Git revision. The working checkout in `projects-local/testril` is older, so this investigation read the pinned Git objects without checking out or modifying that repository.

1. **The pool list discovers factory events.** Its only scope argument is `factory`; its inputs watch `PoolCreated` on that factory. See [pool_list.rs:16](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/functions/uniswap-v3-functions/src/pool_list.rs#L16) and [pool_list.rs:79](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/functions/uniswap-v3-functions/src/pool_list.rs#L79).
2. **Swaps use the discovered pools as emitters.** `Swaps::inputs` watches `Emitters::keys_of` the bound pool list. Without earlier creation events, pools created before the report window would be missing. See [swap.rs:115](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/core/function-core/src/v3_pool/swap.rs#L115).
3. **The catalog marks that dependency as requiring history from creation.** `reads_from_creation` recognizes `Emitters::KeysOf`; binding marks the pool-list dependency accordingly. Registration resolves its creation block and preserves the requirement. See [catalog.rs:283](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/core/function-core/src/catalog.rs#L283), [catalog.rs:451](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/core/function-core/src/catalog.rs#L451), and [bind.rs:66](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/specialists/resolve-specialist/src/bind.rs#L66).
4. **The planner expands each dependency's own window, then prices the union of uncovered blocks.** The historical factory scan therefore dominates the union, but overlapping blocks are billed once, not once per function or pool. See [materialize.rs:700](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/specialists/materialize-specialist/src/materialize.rs#L700), [materialize.rs:886](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/specialists/materialize-specialist/src/materialize.rs#L886), and [materialize.rs:944](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/specialists/materialize-specialist/src/materialize.rs#L944).
5. **The volume node consumes swaps within whole periods.** It has no own persistent state and does not itself require lifetime swap history. See [volume.rs:39](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/core/function-core/src/volume.rs#L39).
6. **Existing integration assertions deliberately expect this bill.** They calculate billed blocks as the report end minus factory creation, explicitly naming the pool-list prerequisite. These tests were read, not executed. See [pool_volume.rs:129](https://github.com/ormi-labs/testril/blob/3b3d84484783c59a78d3278c21697f2879b517c8/crates/daemon/tests/daemon/common/pool_volume.rs#L129).

The live function schema also confirms there is no `pool` or `pools` binding argument: `swap.pool_list.factory` is required, and unknown fields are disallowed. The current `materialize` tool has no `key` filter. Merely moving the existing read filter into that request is unsupported.

The pool list itself is an event-list function, not a lifetime accumulator. The historical requirement comes from its use by the swap reader, and registration preserves that requirement on the shared bound function. The standalone pool-list quote above is for this registered dependency; it should not be interpreted as proof that every independently scoped event list intrinsically needs history from creation.

## Recommended change and ownership

The [proposal for Vineet](../proposals/2026-11-05-explicit-pool-volume-scope.md) develops this recommendation for a fixed set of known pools, including a proposed interface, implementation options, and acceptance tests.

**Testril should support a caller naming the pool before preparation.** For a fixed pool, the required Swap events are in the requested whole-hour window. Discovering every pool the factory has ever created is unnecessary for that question. The Testril team should choose how that scope is represented in the catalog, while retaining the existing factory-discovery behavior for callers asking about all pools.

Reuse the existing swap decoding and period aggregation where practical. Define how the service validates the named pool, chain, factory membership if claimed, and token ordering; do not accept a caller's label as proof. The quote must price the work that will actually execute. No specific replacement function name or argument spelling is assumed here.

The demo should consume that supported scope, keep its fixed pool and report window, enforce its spending cap, and show preparation separately from reads. It should not bypass Testril with its own RPC calculation presented as a Testril result. Scope selection belongs in binding/preparation, not just in result filtering.

Pre-materializing the current factory dependency could make later quotes smaller, subject to actual retained coverage, but moves this initial bill to an operator. It does not make the two providers' preparation scopes equivalent. Removing the historical prerequisite from the existing factory mode without another complete pool-discovery source would produce incorrect results.

## Acceptance criteria for a Testril change

- A named, existing pool with swaps during a three-hour window produces exact hourly counts and absolute raw token volumes, with canonical token ordering and the documented empty-hour behavior.
- Pool creation before the requested window does not require indexing factory history or replaying earlier swaps for the named-pool calculation. A pool not yet deployed in part or all of the window has explicitly defined behavior.
- A second busy pool in the same factory does not enter the selected pool's event processing or result. A read-only result filter is insufficient to establish this.
- The frozen quote and resulting jobs agree on their scope. The cold named-pool calculation's billable block coverage stays within the requested report window, apart from any separately explained, necessary validation work.
- Reused durable coverage and existing paid jobs are handled without duplicate purchases. Stateful lifetime-total functions keep their historical prerequisites.
- Factory-wide discovery and aggregation retain complete results, including pools created before the report window. Existing tests for that behavior remain relevant.
- Quote diagnostics identify which dependency expands work outside the requested window, and the reason, so callers can assess the price before paying.

Paid settlement, data reconciliation against Allium, and runtime costs remain unverified. No application code was changed and no tests were run for this investigation.

## Question to hand to the Testril team

> The one-pool, three-hour Uniswap v3 volume comparison currently binds through `swap.pool_list.factory`. On production 0.17.0 it quotes $1,661.2092 for 13,843,410 blocks; the pool-list dependency alone quotes exactly the same amount. The catalog deliberately marks that list as walking from factory creation because swaps use its keys as emitters. Can we support an explicit named-pool scope that validates the pool and reads only the requested window's swaps, reusing the existing volume aggregation? Please retain complete factory-discovery mode and make any historical expansion visible in quote diagnostics. We need a supported scope change, not a higher demo cap or a subsidized benchmark.
