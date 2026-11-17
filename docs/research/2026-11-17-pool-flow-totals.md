# Full-day transfer totals: Testril and Nansen

17 November 2026. [Recorded measurements and public receipts](2026-11-17-pool-flow-totals.json).

Question: **How many USDC transfers involved Ethereum pool
`0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` on 10 November 2026 UTC?**

Both providers returned **7,139 transfers**. This trial asks for the total; it
does not buy Nansen's individual transaction history.

| Provider | Read service charge | Quote + paid response | Paid response alone | Transfer count |
| -------- | ------------------: | --------------------: | ------------------: | -------------: |
| Testril  |       0.007193 USDC |               3.375 s |             2.396 s |          7,139 |
| Nansen   |       0.050000 USDC |               2.471 s |             2.079 s |          7,139 |

Testril's read was about **6.95 times cheaper**. Nansen finished **0.904 seconds
earlier** in this trial. These are one sequential run from the same Mac, not a
repeated latency study or measurements from the hosted browser. Timing includes
quote negotiation, paid delivery and local counting, and excludes wallet signing.

## What each request actually retrieves

Nansen's `/api/v1/profiler/address/counterparties` request asks for the full day,
token interactions and wallet grouping, with up to 1,000 counterparties on one
page. The response contained 910 entries and explicitly marked that page as the
last. Of those entries, 787 included USDC; summing their USDC `num_transfer`
fields gives 7,139. Other tokens' counts are excluded. This is one paid summary
request, not an API returning a single integer, and other days may require more
pages.

Testril's catalog currently has no wallet transfer-count Function. The existing
`erc20.wallet_transfers` read returns all 7,139 transfers in one response; counting
its rows gives the total. This is the available implementation of the same
question, not a claim that the response formats or server calculations match.

## Preparation and payments

Testril's day was already prepared by the earlier attempt. This trial bought no
new preparation. The known preparation charges for this day's coverage total
**0.860760 USDC**: 0.789000 for the remaining blocks in the earlier full-day
attempt, plus 0.035880 for each of the two previously prepared hours. Keep these
charges separate from the read comparison. Nansen's internal preparation cost and
time are unknown.

Both new payments have confirmed receipts. Testril required a **0.010000 USDC
escrow deposit**, of which 0.007193 was the read service charge; the deposit is
not an additional service fee. New service charges totalled 0.057193 USDC and new
wallet outlay was 0.060000 USDC (Nansen payment plus Testril deposit). Conservative
budget reservations counted both the Testril deposit and its service charge,
remaining below the authorized 2 USDC across both attempts.

The earlier Nansen transaction-history attempt stopped at page 9 with uncertain
settlement. Its authorization was not replayed. The summary purchase is a new
request to a different endpoint; its price and timing exclude that investigation.

## Independent checks

Every Testril transfer, including block, transaction, log position, sender,
recipient and exact amount, matched the independently retrieved Ethereum archive
from the provenance investigation. Every one of Nansen's 787 USDC counterparty
counts also matched that archive, not just their grand total. The evidence JSON
records the archive's location and SHA-256 digest. No new paid provenance request
was made for this trial.

## Reproduction and demo status

The source contains `demos/wallet-statement/test/total-smoke.mjs`, an opt-in
operator trial, and `src/transfer-total.mjs`, the summary normalizer. The script
uses production endpoints, the fixed day above and a locally supplied payer. It
requires explicit funding authorization, caps new reservations at 0.10 USDC,
includes a supplied earlier journal in the overall 2 USDC limit, records intent
before submitting each signature and never retries a submitted authorization.
It saves normalized summary statistics and Testril rows privately in a new
temporary directory. It never writes keys or signed authorizations.

This trial is separate from the current browser demo, which still retrieves and
compares complete transaction ledgers. Its historical recording remains the
original hour. Do not present those hourly measurements as this full-day total
benchmark. The hosted route is now `/pool-flows/`, with no legacy-route redirect.
