# Full-day ledger comparison

17 November 2026. [Complete recording, receipts and verification metadata](../../demos/wallet-statement/recordings/day-2026-11-10.json).

Both providers returned all **7,139 USDC transfers** involving Ethereum's Uniswap
V3 USDC/WETH pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` on **10 November
2026 UTC**, from midnight inclusive to the next midnight exclusive.

|                     |       Testril |                       Nansen |
| ------------------- | ------------: | ---------------------------: |
| Transfers           |         7,139 |                        7,139 |
| Paid read requests  |             1 | 69 transaction-history pages |
| Read service charge | 0.007193 USDC |                0.690000 USDC |
| Read time           |       3.578 s |                    150.528 s |

Testril's read was **95.9 times cheaper** and **42.1 times faster** in this run.
Preparation, provenance and wallet approval/signing are excluded from those
ratios. Nansen's transaction records can contain more than one transfer; page
counts describe transactions, while the compared results count Transfer events.

## What was measured

The same browser client ran the public demo locally against both production
APIs, with automated wallet approval. Testril used `erc20.wallet_transfers` at
`https://api.testril.si/mcp`; Nansen used
`/api/v1/profiler/address/transactions`, with every page through its final page.
Both read times include quote negotiation and complete retrieval, excluding
wallet signing. Total wall-clock duration, including common day lookup, setup,
provenance and signing, was 170.396 seconds.

This is one measured run from that client. It does not measure the Cloudflare
gateway or establish a general latency distribution. The separate counterparty
summary experiment is not used in this comparison.

## Preparation and payments

Testril reused the day's prepared data. Its known previous preparation charges
total **0.860760 USDC**; complete preparation time was not recorded. These charges
are displayed separately in the demo. Nansen's internal preparation is unknown.
Testril provenance took 0.606 seconds and returned without a new charge in this
run; that observation is not a claim that provenance must be free.

All 70 read payments have matching successful provider receipts. Testril needed
a **0.010000 USDC escrow deposit**, separate from its 0.007193 service charge;
the deposit is not another service fee. Nansen's 69 pages cost 0.01 USDC each.

Earlier attempts remain separate. One hosted attempt stopped at page 9 with
uncertain settlement; another completed one Nansen page and then failed while
requesting an unpaid quote. The new run used new authorizations, retained those
journals, and did not replay their payments. Conservative reservations across
all today's attempts and the summary experiment total **1.687772 USDC**, still
below the authorized 2 USDC. That reservation total counts deposits and service
charges separately and is not a claim of net wallet spending.

## Independent verification

Every normalized transaction hash, sender, recipient and exact amount matched
between providers, preserving repeated transfers. Every Testril block/log
position and amount also matched the independently retrieved full-day Ethereum
archive from the provenance investigation. The complete source scan covers
7,173 blocks. All 3,968 cited activity-block hashes matched that archive, and
the expanded provenance digest was recomputed successfully.

The recording identifies the source archive and its SHA-256 digest. These checks
trust the independently retrieved node data, not Ethereum consensus validation.
The source package retains the earlier two-hour checker; its default input does
not replay this separate daily verification.

## Published sample

The demo's Historical Run now loads this full-day recording. Both original hourly
recordings remain available in the source download. Wallet runs continue fetching
the complete ledger from both providers for the visitor's selected day.
This completed local-client recording does not establish that the earlier hosted
provider-response failure has been diagnosed or fixed.
