# Nansen gave the same answer for two different hours

Checked on 14 November 2026.

We asked Nansen this question about one Ethereum address:

**“Who did this address send USDC to and receive USDC from during this hour, and how much moved?”**

We asked twice, for two separate hours on 10 November 2026: noon to 1 p.m. and 1 p.m. to 2 p.m., both in UTC.

Nansen returned exactly the same answer for both hours. We collected the complete answers, not just the first few entries. All 910 entries were identical, including the amounts and counts.

We then checked both hours with Testril. Neither Nansen answer matched either Testril hour. Swapping the hours did not resolve the difference.

To check further, we used a separate Nansen service that lists individual transfers. **That service agreed exactly with Testril for both hours**, including the amounts, senders and recipients.

| Hour on 10 November, UTC | Testril            | Nansen's list of individual transfers | Nansen's summary of money sent and received |
| ------------------------ | ------------------ | ------------------------------------- | ------------------------------------------- |
| Noon to 1 p.m.           | 292 USDC transfers | 292, with matching details            | 7,139 USDC transfers                        |
| 1 p.m. to 2 p.m.         | 503 USDC transfers | 503, with matching details            | 7,139 USDC transfers                        |

The problem is therefore with Nansen's summary of who sent money to whom for these requested hours. Its own list of individual transfers contradicts that summary and agrees with Testril.

This looks like a bug. Nansen may be ignoring the hour in the request or reusing an earlier answer, but we have not confirmed the cause. We have not established what period the repeated answer actually covers.

The service checked is Nansen's **Address Counterparties** service. “Counterparties” means the other addresses that sent or received money. Its request address is:

`https://api.nansen.ai/api/v1/profiler/address/counterparties`

[Nansen's description of the service](https://docs.nansen.ai/api/profiler/address-counterparties) · [Full investigation and saved results](2026-11-14-two-hour-comparison.md)
