# Paid Nansen and Testril trials

13 November 2026. Real Base USDC payments, accountless API access, and returned production data. [Evidence and settlement references](2026-11-13-wallet-statement-paid-trial.json)

**14 November follow-up:** [both hours have now been checked completely](2026-11-14-two-hour-comparison.md), including full Nansen counterparties pagination. Transaction history matches Testril in both hours; neither identical counterparties response matches either hour. The spending and balances below describe the original trial, before that follow-up.

## Wallet statement: passes this trial

Both providers returned the same **292 USDC transfers**, represented by **263 Nansen transaction records over three pages**. The comparison preserved repeated transfers instead of deduplicating by transaction hash. Every tuple of transaction hash, sender, recipient and raw amount matched, including multiplicity.

The subject was a contract address, the Ethereum Uniswap V3 USDC/WETH pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`, from **10 November 12:00 to 13:00 UTC**. Ethereum USDC was the only token. The same scope resolved to Testril blocks `[26384371, 26384670)`. This was a deliberately active address; it is not the payer or a personal wallet.

| Result                              | Both providers   |
| ----------------------------------- | ---------------- |
| Incoming USDC                       | 2,626,205.204677 |
| Outgoing USDC                       | 2,069,464.783424 |
| Total moved, incoming plus outgoing | 4,695,669.988101 |

Six independent Ethereum transaction receipts were also checked, including a transaction with multiple relevant transfers and transactions at the earliest/latest returned blocks. The relevant receipt logs matched Testril's rows. This is a sample check, not an independent scan proving completeness over every block.

The normalized public rows are retained in [Nansen CSV](2026-11-13-nansen-statement-transfers.csv) and [Testril CSV](2026-11-13-testril-statement-transfers.csv); their hashes and comparison definition are in the evidence JSON. Proprietary labels and payment signatures are excluded.

## What the statement cost

| Service                                    | USDC charge  |
| ------------------------------------------ | ------------ |
| Nansen, three transaction pages            | 0.030000     |
| Testril, initial preparation of 299 blocks | 0.035880     |
| Testril, read                              | 0.000319     |
| Total statement trial                      | **0.066199** |

Nansen returned successful x402 receipts for all pages. Testril's preparation job completed all 299 blocks, and its read returned a paid receipt. All reported payment transaction hashes were checked on Base and succeeded.

The sub-cent Testril read required batch settlement, with a **0.01 USDC initial escrow deposit**. Of that, **0.000319** was charged, leaving **0.009681** unspent in the channel. Inspection reported zero claimed on-chain at verification time. Do not count the entire deposit as a read fee or claim the unspent amount has been refunded. The channel remains available for later reads.

The operator used local signing; no Nansen account or API key was used. This verifies the accountless purchase path. It does not verify the future visitor browser integration. That flow must use the full advertised Nansen signature validity window: its documentation requires at least 150 seconds remaining, while the older pool demo's exact-payment signer caps validity at 120 seconds. Reusing that signer unchanged would fail against Nansen. Testril preparation and sub-cent read also exercise different settlement schemes.

## Timing limits

Nansen's individual page operations took 3,193, 5,288 and 3,242 ms, including payment negotiation and local authorization. The Testril read operation took approximately 3,326 ms, including its initial escrow setup. These are diagnostic request measurements from an operator script, not an uninterrupted browser run. Preparation duration was not captured, there were manual gaps between stages, and no user approval delays were measured. Do not publish a speed ratio from this trial. The finished demo must measure the complete workflow and separate preparation, payment setup and wallet waits.

## Counterparties: fails equivalence for the requested hour

The paid counterparties endpoint returned HTTP 200 and settled payments, but its data did not reconcile to the requested hour. Five pages were inspected; pagination was still incomplete. A final diagnostic request for the next, disjoint hour returned an **identical first page**, including the same token totals and counts.

For counterparty `0x51c72848c68a965f66fa7a88855f9f7784502a7f`:

| USDC metric | Matching statement, 12:00–13:00 | Counterparties response for 12:00–13:00 |
| ----------- | ------------------------------- | --------------------------------------- |
| Transfers   | 34                              | 841                                     |
| Incoming    | 1,020,320.767107                | 39,091,190.417167                       |
| Outgoing    | 327,701.521529                  | 35,494,186.415681                       |

The requests specified `source_input: Tokens`, `group_by: wallet`, the same individual address and RFC 3339 timestamps. Nansen's [documented date schema](https://docs.nansen.ai/api/profiler/address-counterparties) permits timestamps. The later test requested 13:00–14:00 on the same day. Loss of time bounds or cache granularity could explain the identical responses, but the cause is unconfirmed. A whole-day interpretation has not been verified.

These diagnostic requests cost **0.30 USDC** in total. No further pages were purchased after the mismatch was established. Do not present those partial results as a complete counterparty report. A fix or a separately verified common window is needed before making this a like-for-like demo; deriving a different report and silently calling it the same endpoint would hide the problem.

## Funding reconciliation

The payer received 1 USDC. At the end of these trials:

- Service charges: **0.366199 USDC**, comprising the 0.066199 statement trial and 0.30 counterparty investigation.
- Unspent channel funds: **0.009681 USDC**, not withdrawn.
- Wallet USDC balance: **0.624120 USDC**.

These sum to the original 1 USDC. No Base ETH funding was necessary for these facilitator-settled payments. No Dune payment, Tempo funding or bridging was performed.

## Build decisions

The first wallet-statement demo has passed paid data-equivalence and settlement checks for this fixture. Build it with fixed disclosed scope, recorded results, visitor-owned Base USDC payments, complete pagination, exact decimal handling and repeat-preserving comparison. A browser trial and a fresh instrumented recording are still required before production claims.

The counterparty demo remains blocked on the time-window discrepancy. Dune's pool-volume trial remains blocked on separate Tempo USDC.e funding. The original condition of all three comparisons being verified is therefore not yet satisfied. The [implementation plan](../specs/2026-11-13-provider-comparison-plan.md) tracks the remaining gates.
