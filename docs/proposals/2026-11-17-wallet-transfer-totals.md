# Proposal for Vineet: return wallet transfer totals

17 November 2026 · Proposed Testril Function, not implemented

## What we need

Let a caller ask:

> How many USDC transfers involved this address during this UTC day, and how
> much USDC came in and went out?

Return a small summary calculated by Testril. The caller should not have to
download thousands of transfers to count them.

Nansen's available summary endpoint returns totals **for each counterparty**,
not just one grand total. To make a future comparison equivalent, Testril should
return those same per-counterparty counts and amounts. The demo can sum the
counts for its headline number, while checking the complete summary from both
providers. A single overall count alone would not match Nansen's full result.

This is a separate capability from the current Pool Flows comparison. That demo
will continue retrieving every transfer from both Testril and Nansen, comparing
the complete results and measuring all required pages. This proposal supports a
future comparison of summaries; it is not a dependency of the ledger demo.

We count **ERC-20 Transfer events**, not distinct Ethereum transactions. One
transaction can contain several transfers: the original demo had 292 transfers
in 263 Nansen transaction records. Keep that distinction explicit in the catalog
description and examples.

## What exists today

Checked against `https://api.testril.si/mcp` on 17 November:

- `erc20.wallet_transfers` returns each Transfer involving one wallet, optionally
  restricted to named tokens. It has no period or aggregate-count parameter.
- `erc20.token_volume` counts transfers of a token per block, across all wallets.
  It cannot answer a question about one wallet.
- `uniswap_v3.pool_volume` already sums a dependency's rows into whole UTC hours,
  days or months. Its period/dependency design is the model for this proposal.

Neither a client-side count nor summing the whole token's activity is the missing
server-side wallet summary.

## Suggested API

Add **`erc20.wallet_counterparties`**, using the existing volume Functions as a
model. Reuse
`erc20.wallet_transfers` as its source dependency and the existing period
aggregation machinery. The final name can follow catalog conventions, but keep
the individual-transfer Function's existing meaning unchanged.

Proposed bind request:

```json
{
  "function_slug": "erc20.wallet_counterparties",
  "chain_id": 1,
  "params": {
    "transfers": {
      "wallet": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      "tokens": ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]
    },
    "by": "day"
  }
}
```

The `transfers` object is a dependency on `erc20.wallet_transfers`, just as
`swap` is a dependency in `uniswap_v3.pool_volume`. Require one wallet and an
explicit, nonempty token list for the first release. A pool contract and an
ordinary wallet address work the same way. Do not discover unrelated wallets,
other tokens, or a pool's factory history.

Support `by: "hour"`, `"day"` and `"month"` through the existing period rules.
If one of these periods needs additional engine work, identify that separately;
the demo initially needs `day`.

Use the existing `materialize`, `inspect`, `read` and `provenance` tools. For the
example, `read` takes the new bound Function ID with:

```json
{
  "bound_function_id": "<ID returned by bind>",
  "from_time": "2026-11-10T00:00:00Z",
  "to_time": "2026-11-11T00:00:00Z"
}
```

Both ends must be valid period starts. Include the start and exclude the end.
Reject unaligned times rather than silently rounding them. A request covering
several days returns separate daily rows, not a single arbitrary-range total.
Arbitrary windows, custom SQL, address labels and entity-level grouping are
outside this first version. Group only by the actual counterparty address.

## The answer

Return one row per active token, counterparty and period. The wallet is fixed by
the binding. For a daily USDC read, one proposed row is:

```json
{
  "day": "2026-11-10",
  "token": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "counterparty": "0x51c72848c68a965f66fa7a88855f9f7784502a7f",
  "transfers": "841",
  "received": "39091190417167",
  "sent": "35494186415681"
}
```

Those are the independently checked values for this counterparty, pool and day.
The full result has 787 USDC counterparties; their counts sum to 7,139,
received amounts to 110741003334701 and sent amounts to 119365478346750.
Amounts are raw token units: USDC has six decimal places. Do not return rounded numbers or
USD valuations. Counts and amounts are nonnegative integer strings, including
values above JavaScript's safe integer range.

The [complete expected counterparty data](https://github.com/ormi-labs/why-provenance-matters/blob/main/data/nansen-day-counterparties.csv)
and [independently retrieved Ethereum evidence](https://github.com/ormi-labs/why-provenance-matters/blob/main/evidence/ethereum-day.json)
are available with the blog's verification materials.

Use the existing period-key formats: `hour` such as `2026-11-10T12`, `day` such
as `2026-11-10`, or `month` such as `2026-11`. Include only the appropriate key.
Return tokens and counterparties separately; never combine different tokens'
amounts. The row key is the period, token and counterparty. Return deterministic
ordering by those keys, not a ranked or truncated list of top counterparties.

The fields have these exact meanings:

| Field          | Meaning                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `counterparty` | The other endpoint: its sender when incoming, its recipient when outgoing.                                |
| `transfers`    | Number of distinct Transfer events between the bound wallet and this counterparty. Count each event once. |
| `received`     | Sum of values sent **from this other address** to the wallet.                                             |
| `sent`         | Sum of values sent from the wallet **to this other address**.                                             |

A self-transfer counts once in `transfers`, but adds nothing to `received` or
`sent`, because it moves nothing into or out of the wallet; its counterparty is
the wallet itself. A zero-value event still counts as a transfer. Minting to
the wallet and burning from it count as
incoming and outgoing respectively, using the event's zero-address endpoint.
Do not deduplicate distinct events merely because their transaction, endpoints
and value match; use the source event's log position.

These are totals of Transfer events. They are not swaps, unique counterparties,
distinct transactions, or a guarantee of the wallet's balance change. Rebases and
tokens with unusual event behavior need that qualification, not invented data.

## Quiet periods and missing data

Follow the existing period-volume convention: an inactive token/counterparty
pair has no row for that period. A successful read of fully covered periods
with no rows means zero transfers. An active period containing only zero-value or self-transfer events
must still have a row, with its nonzero event count.

Missing coverage, unfinished preparation and failed source reads must not look
like a successful empty result. Use the normal structured errors and coverage
inspection. The client may display zero only after the requested period has
been successfully served with complete source coverage.

## Reuse, prices and identity

Use the existing source binding, with the same wallet and tokens. Previously
prepared wallet transfers, including data prepared by somebody else, must be
reusable. Do not fetch the same chain history again solely because the caller
now wants its totals. Any additional work needed to store the aggregate must be
described and quoted as that work, not disguised as missing source history.

No lifetime history is needed. Preparing one day requires that day's transfers
and its period boundaries. It must not start at token or wallet creation.

Wallet, normalized token selection, chain, period and calculation version belong
to the Function's identity. Follow existing address/list normalization, reject
duplicates after normalization, and keep different bindings' results and payment
authorizations separate. Do not silently reinterpret an existing binding.

Keep normal x402 quotes, missing-work reuse, in-flight job inspection and payment
recovery. Preparation, reads and provenance use the normal pricing policy; this
proposal asks for no free endpoint, hard-coded price or special demo discount.
The read must deliver the complete aggregate result, not a top-N subset or
requirement to buy the underlying ledger too. No arbitrary counterparty cap may
silently discard rows. If a documented serving limit is exceeded, refuse
explicitly or use the platform's supported complete-retrieval mechanism. An
independent audit of those rows is a separate operation.

## Provenance

The summary must remain independently checkable. Identify the calculation and
version, the wallet-transfer dependency's bound Function ID, and the exact
source range behind each period.

Follow the existing aggregate-provenance model: cite dependency rows in
`sources`, then let a caller request that dependency's provenance to reach its
block references. Do not invent a block list when the parent citation is a
calculation over stored rows. Preserve the distinction between an absent block
list and an enumerated empty one.

A verifier must be able to obtain the source references, reconstruct the complete
period's Transfer events, apply the rules above and reproduce every count and
amount. This includes checking quiet periods and completeness, not just matching
the few blocks where transfers were returned. Reorganizations must invalidate or
mark affected source and aggregate results through the existing mechanism.

## Acceptance checks

Run the new Function and its MCP/payment integration checks; unrelated demo
suites are not required.

1. In one hour, give wallet A these events: A→B 100, B→A 30, A→A 50,
   C→A 20 and D→A 0. Expect `transfers: "5"`, `received: "50"`,
   `sent: "100"` after summing the four counterparty rows. B has two transfers,
   received 30 and sent 100; A's self row has one transfer and zero received/sent;
   C has one transfer and received 20; D has one zero-value transfer. Add an
   event exactly at the next hour's start and verify
   that it appears only in the next hour.
2. Include two identical-looking events with different log positions in one
   transaction. Count both. Include another token, an unrelated wallet,
   mint/burn events, large integers and enough values to exercise overflow
   handling. Never round, wrap or silently drop a row.
3. Check quiet periods, quiet tokens within a multi-token binding, and periods
   containing only self-transfers or zero-value events. Missing one source block
   must prevent a supposedly complete answer.
4. Check hourly, daily and monthly boundaries, including February and year
   changes. Reject unaligned, reversed or invalid windows. A partial first or
   last period must not be served as a complete period.
5. Prepare the source first, then request the aggregate as another payer. Verify
   source reuse, correct missing-work quotes, existing-job reuse and consistent
   results. Repeat with partial coverage, failed preparation and uncertain
   payment; no automatic duplicate purchase is allowed.
6. Through the actual paid MCP path, compare the summary to a complete source
   read and independently reconstructed chain events. Verify that provenance
   names the correct dependency and period, and fails verification after a
   source amount or source block hash is changed.
7. For the real fixture above, return all 787 USDC counterparties, with exactly
   7,139 transfers, received
   110741003334701 and sent 119365478346750, or report and investigate a
   reproducible discrepancy. Compare every counterparty row to independently
   reconstructed events, not just the grand totals. Do not hard-code those
   values. A second period and wallet must also be tested.

## Handover

Please return the accepted slug, bind/read examples, field schemas, supported
networks and periods, structured errors, provenance examples, pricing behavior
and release revision. Identify any engine work separately before expanding scope.

The demo can then add a separate summary comparison against Nansen's counterparty
summary. We will verify the same period, token and event-count definition before
comparing cost and time, including every counterparty's exact count and amounts.
Nansen may also return labels and other tokens; those are outside the normalized
USDC comparison. If its treatment of self-transfers or another edge case differs,
report the difference before claiming equivalence. Keep the existing
complete-ledger comparison intact.
