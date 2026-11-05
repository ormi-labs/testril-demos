# Proposal for Vineet: calculate volume for a few known pools

5 November 2026 · Proposed change

## What we need

We are building a demo that asks Testril and Allium the same question:

> For these few Uniswap v3 pools, how many swaps happened in each hour, and how much of each token changed hands?

The demo will use a fixed list of Ethereum pools and a three-hour period. It will compare answers, time, and charges, showing Testril's preparation costs separately from reads.

Please let us give Testril those pool addresses directly, so it prepares data for those pools during those hours.

## Why the current function is too expensive for this demo

Today, Testril takes a factory address and discovers the pools that factory created. To find pools created before our three-hour period, it reads the factory's pool-creation history from the beginning. It then uses those pool addresses to find swaps.

That discovery step dominates the price. Production quoted **$1,661.2092 for 13,843,410 blocks**. Preparing the pool list alone cost exactly the same in the quote as preparing the complete volume report. Asking for only the last hour also produced the same quote. Nothing was paid.

The quote follows the current rules and counts overlapping blocks once. The historical work is discovering pools, rather than replaying years of swaps.

We already know which pools we want. We need a way to supply them without buying that discovery work. Filtering the results with `key.pool` happens too late to help.

The [investigation](../research/2026-11-05-pool-volume-materialization-scope.md) contains the quotes and code references.

## Suggested change

Prefer adding a pool-address list to the existing swap function and keeping the existing volume calculation. For example, this **proposed** bind request would select one pool; the list could contain several:

```json
{
  "function_slug": "uniswap_v3.pool_volume",
  "chain_id": 1,
  "params": {
    "by": "hour",
    "swap": {
      "pools": ["0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"]
    }
  }
}
```

The existing materialize, inspect, and read tools would handle preparation and retrieval. For example, `from_time: "2026-10-17T12:00:00Z"` and `to_time: "2026-10-17T15:00:00Z"` select three hours, including the start and excluding the end.

The swap function would accept either a factory's pool list or explicit pool addresses. Please keep factory discovery working for callers who need all the pools.

If supporting both choices makes the existing function or catalog substantially more complicated, a separate function for known pools is fine. Please recommend the simpler design before implementation. Reuse the current swap decoding and volume arithmetic wherever practical.

## How it should behave

**The chosen pools must determine which events Testril fetches.** It should request Swap events from those addresses during the requested period. It should not discover the factory's other pools or fetch earlier swaps just because a selected pool is old.

**Keep the current result format and meaning.** Each row has `hour`, `pool`, `swaps`, `volume0`, and `volume1`. Counts and amounts remain exact integer strings. Token0 and token1 follow the pool contract's order. Volume counts amounts moving in both directions: swaps that cancel each other out still contribute volume. As today, an hour without swaps has no row; the demo supplies zeroes for display. Keep the existing whole-period rules and supported periods where practical.

**Check the pool addresses and explain failures.** Reject an empty list, duplicates, malformed addresses, an excessive list, or a request supplying both selection methods or neither. State the list-size limit. Use Testril's existing validation approach to distinguish a valid quiet pool from an invalid contract or a failed lookup. Establish token ordering from contract data, and verify factory membership if the API claims it. The demo initially needs canonical Uniswap v3 pools; additional fork support can wait.

**Define what happens around pool creation.** Ideally, a pool created during the requested period contributes its swaps after creation, with no earlier rows. If that case cannot be supported reliably in the first release, return an explicit error. A pool that did not exist during the entire period must not look like a verified pool with zero activity. Document which historical state validation checks and disclose any necessary validation charge before payment.

**Treat the pool list as part of the request's identity.** Address order and capitalization should not change the resulting bound function ID. Changing the selected pools should. Reject duplicates after normalizing addresses. Keep results, jobs, and payments attached to the correct selection. Preserve the meaning of existing stored bindings.

**Use the normal coverage and payment rules.** Reuse prepared data, wait for work already paid for, and charge only for missing work. Keep the existing retention, read charges, quote expiry, and payment recovery rules. The quote must describe the work that actually runs; no special demo price is requested.

## How to check it

Please test through MCP with fake chain responses that make these cases distinguishable:

1. Select pools A and B, with a busy pool C in the same factory. Verify that chain requests name A and B and that C contributes nothing.
2. Give A and B old creation dates. Preparing three hours must not request factory history or earlier swaps. Check that the quote, jobs, and chain requests agree. Moving the requested start forward should reduce new work when coverage is empty.
3. Give A two swaps in one hour: `(+7, -11)` and `(-7, +11)`. Expect two swaps, volume0 of `14`, and volume1 of `22`. Also check large integers, multiple swaps in one transaction, events exactly at each time boundary, and quiet hours.
4. Reorder addresses and change their capitalization: expect the same ID. Add or remove a pool: expect a different ID. Check invalid lists and attempts to use another selection's results or payment authorization.
5. Check fully and partly prepared data, work already running, expired quotes, and uncertain payment outcomes. Existing paid work must not be purchased again. Sharing preparation between different pool lists is not required by this proposal.
6. Check invalid contracts, failed metadata requests, and pools created during or after the requested period. Follow the documented behavior rather than returning misleading zeroes.
7. Keep the factory-wide tests passing, including discovery of pools created before the requested period. Functions calculating lifetime totals must retain the history they need.

## Who does what next

Vineet chooses the API design and implements the Testril change, including validation, quotes, execution, errors, documentation, and tests. Please return an accepted bind example, supported error codes, and the release revision. A production check can first obtain a quote without paying; paid verification needs its own spending approval.

The demo will then supply its fixed handful of pools, update its time arguments to the current API, and ask Allium for the same calculation. It will check the returned addresses, token ordering, and values before comparing timing and spend. The harness continues to handle hosting and sessions.

Allium's SQL endpoint is currently returning 503. That blocks the final comparison, but it does not block implementing or testing this Testril change. We still need completed paid runs and independently checked results before publishing measured recordings.

## Code starting points

The investigation reviewed upstream commit [`3b3d844`](https://github.com/ormi-labs/testril/commit/3b3d84484783c59a78d3278c21697f2879b517c8), version 0.17.0. Start with these files; the linked investigation has the full source trace.

- `crates/core/function-core/src/v3_pool/swap.rs`: pool selection and event reading.
- `crates/core/function-core/src/v3_pool/pool_volume.rs` and `src/volume.rs`: existing volume arithmetic and grouping by period.
- `crates/core/function-core/src/catalog.rs`: binding the selected pools and any dependencies.
