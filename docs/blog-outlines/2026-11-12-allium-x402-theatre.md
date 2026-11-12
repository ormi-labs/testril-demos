# Blog outline: Allium's x402 theatre

Draft for Paul's writing agent · 12 November 2026.

## Working title

**Allium's x402 Theatre: Twelve Advertised Operations, No Payment Challenge**

Alternative: **We Tried to Buy Allium Data Without an Account. Its Own Endpoints Wouldn't Let Us.**

Deck: Allium advertises wallet-paid access without registration. On November 12, its documented machine-payment data routes returned authentication errors, missing routes, and service-unavailable responses. The gap matters to anyone building agents that are supposed to transact autonomously.

## Argument

An accountless data product should let a new buyer discover the service, receive a price, authorize payment, and obtain usable data. At the time of our check, Allium's advertised path failed before it offered a payment challenge. Calling a product agent-ready is premature when developers must ask a human which advertised endpoints actually work.

Use “theatre” as a judgment about the gap between the promise and the observed experience. The [evidence note](../research/2026-11-12-allium-x402-state.md) establishes that gap; it does not establish dishonest intent.

## 1. Start with what we wanted to build

We wanted to compare Testril and Allium on the same blockchain-data task, showing actual time and actual spend. We wanted Allium to work: without a functioning second provider, there is no honest comparison.

Disclose the author's connection to Testril here. Explain that the pool-volume demo is on hold and that we searched for a simpler alternative rather than treating one SQL failure as a verdict on the entire interface.

Suggested opening:

> We set out to buy some blockchain data and compare the receipt. We ended up investigating whether the advertised shop was open.

## 2. Put the promise beside the result

Link Allium's [machine-payment overview](https://docs.allium.so/ai/machine-payments/overview) and [endpoint list](https://docs.allium.so/ai/machine-payments/endpoints-pricing). Paraphrase their offer: USDC per request, without an Allium account or subscription, through the agents host.

Use a compact table:

| Advertised operations checked                                                      | Result on November 12    |
| ---------------------------------------------------------------------------------- | ------------------------ |
| Four price operations; latest/historical balances; transaction history; wallet P&L | Eight HTTP 404 responses |
| Token list, search, and lookup                                                     | Three HTTP 401 responses |
| SQL submission                                                                     | One HTTP 503 response    |

The central sentence: **All 12 explicitly advertised machine-payment data operations failed to offer a payment challenge in our check.**

Do not describe all 30 exploratory requests as advertised paid products. Three of those requests successfully returned free discovery information.

## 3. Explain what failed, in plain English

- **401:** the endpoint demanded authentication instead of offering the advertised payment path.
- **404:** the documented request reached a missing route response.
- **503:** the service said the operation was unavailable.

Include one short reproducible curl example from the evidence note. Explain that no private key, API key, or payment signature was needed to discover whether the endpoint offered a price.

We did not reach signing, settlement, or delivery. This is not evidence of taking payment and withholding data. It is evidence that we could not start the advertised purchase.

## 4. Show that this was investigated, not inferred from one error

We checked the CLI's actual host and preference header, used documented request shapes, tried the ordinary API host, and checked every route returned by free realtime discovery. Free chain and documentation discovery worked; none of the checked data routes offered a payment challenge.

The agents landing page also returned 503 and said the service was disabled. Report that observation without inventing a reason for it.

Keep the detailed 30-request matrix in the linked evidence appendix. Readers should be able to reproduce the central failures without reading an incident report.

## 5. Include the facts that complicate the criticism

In October, balances, prices, and SQL submission did return payment challenges. We did not complete a paid transaction then. SQL returned 503 on November 5 and again on November 12; that does not prove uninterrupted downtime between checks.

The CLI contains a wallet-payment implementation, including local signing. The hosted MCP's account requirement is a separate issue. Do not claim that a Privy account is mandatory or that Allium never built x402 support.

The sharper question is: why does the public documentation continue to direct a new buyer into a path we cannot use, and where is the working replacement or clear service-status explanation?

## 6. Define what “x402 theatre” means here

Make the editorial case that a payment protocol logo, sample signer, and pricing table are not enough to deliver the promised autonomous purchase experience. A buyer needs maintained routes, discoverable prices, working delivery, and clear failure behavior.

Suggested line:

> If the next step after following your accountless API documentation is to find someone who can explain how to get access, you have put the human back in the loop.

Qualify this as our experience and a product criticism. An outage can happen to any service. The issue is the mismatch between the offer still being published and the path available to a new buyer when checked.

## 7. Explain the cost to builders

Our comparison could not proceed. We spent time ruling out request mistakes and looking for another task the API could support. We could not produce a real timing or spending comparison.

Keep this concrete. Do not invent engineering-hour totals, customer losses, outage duration, or evidence of other affected buyers.

## 8. Ask Allium for a testable answer

Ask for the production x402 URL, enabled operations, an explanation of the observed responses, and a complete wallet-only example that returns data. Ask whether the full SQL purchase includes polling and retrieval without an API key.

Paul previously reported posting a question on X. Insert its actual URL and any response only after obtaining them. No response record is available in this research; do not claim silence or refusal.

Close with a commitment to publish a correction or update if the route changes or Allium demonstrates a working flow. That makes the criticism testable and gives the story a useful outcome.

Suggested closing:

> We still want to run the comparison. Give us a working endpoint, let the wallet pay, and let the data speak.

## Before publishing

- Re-run the three representative unpaid requests and preserve their dated results. If behavior changes, update the thesis and table.
- Keep the author's Testril connection prominent. Make no Testril speed or cost claims from an uncompleted comparison.
- Include the October counterevidence and distinguish the advertised 12 operations from the wider exploratory sweep.
- Add any Allium response accurately. Do not imply that anyone was contacted by this agent.
- Treat allegations of intent, fabricated volume, fraud, or customer harm as unsupported; the observed access failures are sufficient for the argument.

## Writing direction

Aim for 900–1,200 words. Be angry about the experience, precise about the evidence, and plain about what would resolve it. Lead with the attempted purchase and the results. Avoid a long x402 tutorial or a Testril sales pitch.
