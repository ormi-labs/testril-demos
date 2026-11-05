# Proposal for Vineet: volume for explicitly named Uniswap v3 pools

5 November 2026 · Proposed work, not an implemented API.

## Requested outcome

Let a caller ask: **“For these known pools, how many swaps occurred and how much of each token changed hands in each whole UTC hour?”** Prepare only the requested window's events for those pools. Discovering all pools from a factory's creation must not be a prerequisite for this scope.

The immediate caller is the Testril/Allium comparison demo. It will select a small, fixed list of known Ethereum Uniswap v3 pools and a three-hour historical window. Both providers must answer for the same pool addresses, token ordering, and time boundaries. Preparation, paid reads, and wallet approval time will be reported separately. Visitors will not supply arbitrary addresses or SQL.

**Recommendation: extend the existing swap function's scope and reuse the existing volume aggregator if this fits the typed catalog cleanly. A new public function is not a requirement.** If adding an alternative scope would require broad catalog changes, propose a small separate named-pool swap source and corresponding volume entry instead. Confirm that choice before implementation; no general function framework is requested.

## Why this is needed

The current binding is `uniswap_v3.pool_volume → uniswap_v3.swap → uniswap_v3.pool_list`, with the factory supplied through `swap.pool_list.factory`. The swap source watches the keys of that list, so the catalog correctly requires its complete history from factory creation. The demo's `key.pool` read filter does not narrow the preparation scope.

Unpaid production checks on Testril 0.17.0 found:

| Scope, for 17 October 2026       | Billable blocks | Quoted USDC |
| -------------------------------- | --------------: | ----------: |
| Pool list alone, 12:00–15:00 UTC |      13,843,410 | $1,661.2092 |
| Swaps, 12:00–15:00 UTC           |      13,843,410 | $1,661.2092 |
| Hourly volume, 12:00–15:00 UTC   |      13,843,410 | $1,661.2092 |
| Hourly volume, 14:00–15:00 UTC   |      13,843,410 | $1,661.2092 |

These are quotes, not charges. No paid work was started. The historical pool-discovery scan dominates; the planner prices the union of dependency holes, not a separate charge for every overlapping function. It does not necessarily replay historical swaps outside the report window.

See the [investigation with live evidence and pinned source references](../research/2026-11-05-pool-volume-materialization-scope.md). This is a missing scope for the caller's question, rather than evidence that the existing factory-wide calculation is incorrect.

## Proposed caller interface

The following is the preferred interface sketch, subject to Vineet's review. These arguments are **not currently accepted**:

```json
{
  "tool": "bind",
  "arguments": {
    "function_slug": "uniswap_v3.pool_volume",
    "chain_id": 1,
    "params": {
      "by": "hour",
      "swap": {
        "pools": ["0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"]
      }
    }
  }
}
```

The array can name several pools. Under this option, `uniswap_v3.swap` takes exactly one scope: the existing nested `pool_list` or the explicit `pools` array. Neither, both, an empty array, malformed addresses, or unknown arguments produce structured validation failures. Normalize addresses and sort the set before deriving identity; reject duplicate addresses after normalization so duplicates cannot multiply events. Use a documented finite address-list limit consistent with existing service limits.

After binding, the existing tools carry the window:

```json
{
  "tool": "materialize",
  "arguments": {
    "bound_function_id": "<ID returned by bind>",
    "from_time": "2026-10-17T12:00:00Z",
    "to_time": "2026-10-17T15:00:00Z"
  }
}
```

An unpaid call obtains the actual quote; the normal payment flow authorizes it before execution. Then inspect the returned job and read the same half-open window. Reading without a `key` returns every selected pool's rows; `key.pool` may narrow the returned rows, but cannot widen the bound scope or change what preparation bought.

Keep the existing hourly row shape: `hour`, `pool`, `swaps`, `volume0`, `volume1`, with integer strings. Counts are Swap-event counts; each token's volume is the sum of absolute amounts, not the absolute net amount. Token0/token1 follow the pool contract's ordering. An hour with no swaps has no row, matching the current function; the demo fills missing pool/hour cells with zero for display.

Preserve the existing whole-period rules. Use the current aggregator's supported periods where practical; no new period or valuation metric is requested.

## Implementation direction

Review against the current source, rather than the older working checkout. The investigation used upstream [3b3d84484783c59a78d3278c21697f2879b517c8](https://github.com/ormi-labs/testril/commit/3b3d84484783c59a78d3278c21697f2879b517c8):

| Existing code                                                      | Relevance                                                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `crates/core/function-core/src/v3_pool/swap.rs:59`                 | Scope currently requires the typed `pool_list` dependency.                                                             |
| `crates/core/function-core/src/v3_pool/swap.rs:124`                | Event inputs currently use `Emitters::keys_of`; named addresses should become the actual log emitters.                 |
| `crates/core/function-core/src/v3_pool/pool_volume.rs:34`          | Existing exact swap tally and absolute-volume behavior to reuse.                                                       |
| `crates/core/function-core/src/volume.rs:39`                       | Existing period aggregation reads swaps and has no lifetime-state prerequisite.                                        |
| `crates/core/function-core/src/catalog.rs:283`                     | Dependency binding and the history requirement follow the declared inputs.                                             |
| `crates/core/function-core/src/catalog.rs:364`                     | Nested dependency slots are resolved before typed parameter deserialization; assess the alternative-scope schema here. |
| `crates/core/function-core/src/seam/inputs.rs`                     | Existing event inputs support explicit emitters; a new backend query language is not requested.                        |
| `crates/functions/uniswap-v3-functions/src/lib.rs:19`              | Public catalog registration if a separate entry proves simpler.                                                        |
| `crates/specialists/materialize-specialist/src/materialize.rs:700` | Existing per-node windows, coverage subtraction, and union billing should remain authoritative.                        |

For named pools, declare the actual emitters directly. Do not register a synthetic historical pool-list dependency just to adapt to the existing generic type: that would obscure scope and risk reintroducing the history requirement. Reuse decoding and aggregation without introducing speculative abstractions for unrelated protocols.

Define the supported pool contract family and validate the supplied addresses using the service's established contract-validation mechanism. The demo initially needs canonical Uniswap v3 pools. It does not require extending support to additional fork ABIs. Distinguish an invalid pool or failed metadata lookup from a valid pool with no Swap events. Establish token ordering from contract data; if the API asserts factory membership, verify that assertion rather than accepting a caller label.

Specify behavior for a pool created during the requested window. Recommended behavior is to include its events after deployment and omit earlier empty hours, without discovering other pools or scanning lifetime swap history. If reliable support requires additional work, state and refuse that case explicitly for the first release instead of silently returning partial data. A pool absent for the entire historical window must not be mistaken for a verified, quiet pool.

Validation must not silently broaden paid work or become an unbounded free indexing operation. Document when it runs, which historical state it checks, and how any necessary charge is quoted. Quote the plan that will execute. Do not promise a fixed dollar price before obtaining the new scope's actual quote.

Binding identity must include the normalized pool set and chain through the existing identity rules. Different scopes must not share rows, coverage, jobs, or payment authorizations. Follow the catalog's versioning policy; do not silently reinterpret existing stored bindings. The factory scope must still discover pools created before the report window.

## Responsibilities

**Testril owns** scope validation and identity, emitter selection, exact event decoding and aggregation, window resolution, coverage, execution, quotes, settlement/recovery, and documented structured failures. Historical prerequisites remain in functions that actually need them.

**The demo owns** its fixed handful of pools, matching Allium SQL, the fixed window, spending limits, wallet approval, comparison, and presentation of preparation versus reads. It validates each provider's returned scope and token ordering before comparing results. The hosted harness owns session and hosting concerns under the existing demo/harness contract. Neither demo nor harness should implement a substitute RPC calculation and label it a Testril result.

## Acceptance tests

Use realistic fake chain HTTP responses and the actual MCP flow. These are requirements for the implementation, not tests to run for this proposal.

1. **The selected pools determine the work.** Use selected pools A and B, plus a busy excluded pool C from the same factory. Assert the upstream event filters name only A and B and the result excludes C. Factory history before the requested window must not be requested for this scope.
2. **Old pools do not imply old swap history.** A and B were deployed long before the window. Cold preparation covers the requested whole hours, without pool discovery or earlier swap replay. Quote quantities, paid jobs, and actual chain requests agree; shortening the start trims the corresponding work.
3. **Arithmetic distinguishes net from volume.** Two A swaps in one hour have amount pairs `(+7, -11)` and `(-7, +11)`: count `2`, volume0 `14`, volume1 `22`. Include amounts above JavaScript's exact-integer range, multiple events in one transaction, both boundary instants, and a quiet selected pool/hour.
4. **Scope identity is deterministic and isolated.** Reordering addresses or changing case yields the same normalized binding; duplicates, empty/both/neither scopes, and invalid addresses fail. Adding or removing a pool changes identity, and results or payment authorizations from another scope cannot be substituted. Reuse of coverage across different pool sets is not assumed.
5. **Coverage and payment behavior remain correct.** Shared durable coverage reduces new work, existing paid jobs are followed, and a partially covered window buys only missing work. Quote expiry and uncertain payment outcomes follow the existing recovery contract. Retention and read charges remain explicit.
6. **Validation does not fabricate zeroes.** Invalid contracts and unavailable metadata produce structured failures. Test the documented behavior for deployment inside the window and absence throughout it; quiet hours on a verified pool remain distinguishable from unsupported input.
7. **Factory mode remains complete.** Existing discovery and lifetime-state tests remain applicable. Pools created before the report window are still included when the caller selects the factory scope.

The critical cost check is the absence of unrelated historical work, not a hardcoded dollar threshold. Any prerequisite outside the requested window must be necessary, disclosed before payment, and agreed as part of the contract.

## Delivery and dependencies

1. Vineet confirms extension versus separate catalog entries, the scope schema, contract validation, deployment-boundary behavior, and binding/version implications.
2. Implement the Testril change with its caller-facing tests, generated schemas/catalog descriptions, source documentation, and normal repository checks. Provide the accepted bind examples, supported failure codes, and release revision.
3. Verify production unpaid discovery and a bounded named-pool quote. Any paid settlement or materialization requires separate scoped authorization.
4. The demo adopts the accepted schema, migrates its old hour-window arguments to current time-window arguments, and compares the same selected pools on both providers. Complete paid vendor verification and independently reconcile results before publishing a recording or benchmark claim.

Allium's accountless SQL service currently returns 503; restoration is an independent dependency for an end-to-end comparison. The Testril scope feature can be implemented and verified with fake peers without waiting for Allium. This proposal has not been implemented or sent to Vineet.
