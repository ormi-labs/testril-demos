# Nansen and Testril: both hours checked

Checked 14 November 2026 with paid production queries. The data windows are **10 November 2026, 12:00–13:00 and 13:00–14:00 UTC**, both half-open. The subject is Ethereum pool contract `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`; the token is Ethereum USDC.

**Later verification:** the [Why Provenance Matters materials](why-provenance-matters/README.md) independently reconstruct all 795 transfers and all per-hour counterparty totals from Ethereum, starting with the saved provenance. That follow-up searches the full 598-block range, verifies cited block hashes and source digests, and goes beyond the receipt samples described below. The accompanying program and recorded Ethereum responses make the check reproducible.

## Result

**Neither Nansen counterparties result matches either Testril hour.** Nansen's transaction-history endpoint matches Testril exactly in both hours.

| USDC transfers | Testril transfers | Nansen transaction history | Nansen counterparties |
| -------------- | ----------------- | -------------------------- | --------------------- |
| 12:00–13:00    | 292               | 292, exact match           | 7,139, mismatch       |
| 13:00–14:00    | 503               | 503, exact match           | 7,139, mismatch       |

Counts in the last column sum the USDC `num_transfer` values from the counterparties response. Each provider's incoming and outgoing amounts were also compared, not just counts. The statement comparison preserves repeated transfers and checks every transaction/sender/recipient/raw-amount tuple, including multiplicity. No amounts were rounded to force a match.

## Complete queries, not first-page comparisons

- Re-fetched Nansen transaction history for both hours: **263 transaction records over three pages** for the first hour and **470 over five pages** for the second. Those records contain 292 and 503 relevant transfer legs respectively. Every final page reported `is_last_page: true`.
- Re-fetched Nansen counterparties for both hours using `per_page: 1000`. Each returned **910 total counterparties**, including **787 with USDC**, with `is_last_page: true`. Their **entire response bodies are identical**, including non-USDC data, not merely the leading counterparty.
- Read the matching scoped Testril transfers for both hours, preparing the second hour's missing 299 blocks first. The first hour's existing coverage was reused. Their USDC counterparty aggregates contain **93** and **158** addresses respectively.
- Tested all four counterparties comparisons: Nansen 12 against Testril 12 and 13, and Nansen 13 against Testril 12 and 13. All fail. Swapping the hour labels does not fix the discrepancy.

Both counterparties requests used the individual address, `chain: ethereum`, `source_input: Tokens`, `group_by: wallet`, and the specified RFC 3339 timestamps. Incoming/outgoing USDC was extracted from each counterparty's token details; other tokens and labels were excluded from equality checks. The [documented request schema](https://docs.nansen.ai/api/profiler/address-counterparties) permits timestamps.

## Concrete counterparty example

For `0x51c72848c68a965f66fa7a88855f9f7784502a7f`:

| USDC metric | Testril 12:00–13:00 | Testril 13:00–14:00 | Nansen counterparties, either hour |
| ----------- | ------------------- | ------------------- | ---------------------------------- |
| Transfers   | 34                  | 49                  | 841                                |
| Incoming    | 1,020,320.767107    | 2,458,599.369898    | 39,091,190.417167                  |
| Outgoing    | 327,701.521529      | 4,978,945.772832    | 35,494,186.415681                  |

Testril's statement totals across every counterparty are:

| USDC amount | 12:00–13:00      | 13:00–14:00       |
| ----------- | ---------------- | ----------------- |
| Incoming    | 2,626,205.204677 | 10,682,099.941951 |
| Outgoing    | 2,069,464.783424 | 14,470,892.270815 |

Nansen transaction history produces those same totals. Nansen counterparties instead reports **110,741,003.334701 incoming** and **119,365,478.346750 outgoing** for each requested hour.

This isolates the observed inconsistency to the counterparties endpoint's response for these inputs. Loss of time bounds, cache granularity or another aggregation problem could explain it, but the cause remains unconfirmed. No whole-day query was purchased, so do not claim the results have been proven to represent a full day.

## Independent checks

Ethereum RPC block timestamps confirm the Testril windows are `[26384371, 26384670)` and `[26384670, 26384969)`. The block immediately before each boundary is at `:59:59`; the boundary block is at `:00:11`. The earlier block is excluded/included as appropriate for the requested hour.

Three additional canonical transaction receipts for the second hour were checked, including earliest/latest returned blocks and a transaction with repeated transfers. Their relevant logs match the returned transfer tuples. These supplement the first trial's six receipt checks; they do not constitute an independent exhaustive scan of the full interval.

## Spending

| New service charges for this check      | USDC         |
| --------------------------------------- | ------------ |
| Nansen transaction history: eight pages | 0.080000     |
| Nansen counterparties: two pages        | 0.100000     |
| Testril preparation: second hour        | 0.035880     |
| Testril reads: two hours                | 0.000638     |
| Total                                   | **0.216518** |

All new Nansen payment transactions and the Testril preparation transaction succeeded on Base. The two sub-cent Testril reads reused the existing escrow channel and returned paid voucher receipts; they have no new on-chain settlement transaction. No new escrow deposit was purchased.

The original 1 USDC now reconciles to **0.582717 service charges**, **0.408240 wallet balance**, and **0.009043 unspent escrow**. The escrow remains open, with no withdrawal performed. No Tempo payment was made.

## Evidence

The [summary JSON](2026-11-14-two-hour-comparison.json) includes all four cross-comparisons, complete-pagination confirmation, payment evidence, independent block/receipt checks and SHA-256 hashes of these normalized public files:

- [12:00–13:00 statements, both providers](2026-11-14-hour-12-statement.csv)
- [13:00–14:00 statements, both providers](2026-11-14-hour-13-statement.csv)
- [12:00–13:00 USDC counterparty aggregates, both providers](2026-11-14-hour-12-counterparties.csv)
- [13:00–14:00 USDC counterparty aggregates, both providers](2026-11-14-hour-13-counterparties.csv)

Amounts are raw USDC atoms in the files. Private keys, signatures, temporary payment challenges and proprietary labels are excluded. These results extend the [13 November trial](2026-11-13-wallet-statement-paid-trial.md); they verify these two windows and this address, not every possible Nansen query.
