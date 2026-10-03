# Testril demo strategy

**Working proposal · 3 October 2026**

Read the [two-page brief](demo-summary.md) first. [Function briefs](function-briefs.md) specify the backend requests; the [research baseline](research/baseline.md) separates observed behavior, repository implementation, and future capability. Prices and competitive observations are dated, not enduring promises.

## 1. The recommendation

Lead with **useful work in fractions of a cent**. Testril is being built around small purchases, paid materialization, and reuse; conventional API access and billing can sit above that foundation. This direction matters: tiny payments are part of the product economics, not merely another checkout option.

Make Testril memorable through a useful result and a surprising economic consequence:

> **Buy the answer. Inspect the evidence. Earn when the data gets reused.**

When function creation ships, add:

> **And when the metric doesn't exist, create it.**

Build a connected series around three experiences: an investigation, a second customer paying to reuse its data, and eventually a customer creating the missing metric. Those experiences generate product walkthroughs, engineering examples, and short marketing films. We do not need nine unrelated applications to tell nine stories.

Open the series with **One Cent, Many Decisions**, a short demonstration of selective paid checks inside a one-cent read allowance. The first workflow flagship is **Follow the Money**: a developer gives an agent a treasury address, token, block window, and spending limit; receives an explanation of an outflow; opens the evidence; and exports a result they can put in a product. The next episode shows someone else buying the same materialized data and the original payer's earned balance increasing.

This makes the engineer the protagonist: “I delivered the answer, I can defend it, I can ship it, and the data I funded can earn from reuse.”

### Audience and first commercial foothold

The working priority is **agent and application developers**, with protocol treasury and operations teams supplying the first concrete problem. Broader data teams are a subsequent audience. This is a proposed priority, not customer research already completed.

| Audience | Job to finish | Reason to try Testril | Demo evidence |
| --- | --- | --- | --- |
| Agent/application developer | Add a useful onchain investigation to a product | Bounded purchases, inspectable results, small readable integration | Forkable example, receipt, replayable calculation |
| Protocol operations/treasury | Explain where a token balance went | Exact scope, counterparties, reconciliation, evidence | One-page case file and transaction/block drill-down |
| Data engineer/analyst | Answer a new request without owning another pipeline | Reusable materialization; later, new server-side computations | Independent reuse and a reproducible function revision |
| Ecosystem/data sponsor | Make important data available to others | Visible demand and a share of eligible read fees | Separate buyer and supplier accounts, earnings, payout evidence |

Start with one real, bounded customer workflow. Full Dune/Allium/Nansen replacement remains a direction requiring coverage, history, reliability, semantics, and distribution. Earn replacement of one workflow before claiming replacement of the platform.

## 2. Competitive reality and positioning

**Sub-cent purchasing is a leading differentiator in its own right.** A one-cent or five-cent charge for every call changes what is economical to build: selective probes, conditional follow-ups, and frequent narrow checks accumulate cost even when each returns little data. Testril should show an agent buying only the next useful piece of evidence, with each charge visible in fractions of a cent.

The architectural positioning is **a data economy built around tiny transactions, with familiar APIs and billing above it**. The competitive contrast is adding machine payments to existing API products. That describes our product direction; it is not a claim about competitors' undocumented internal architecture. Payment protocol support alone says little about the smallest useful purchase a provider actually sells.

Published pricing supports the distinction. Nansen advertises **$0.01 basic / $0.05 premium calls**. Allium lists **$0.01 SQL submission**, **$0.02 price endpoints**, and **$0.03 wallet endpoints**, with separately priced results. Dune documents per-request MPP access; the reviewed page does not establish its minimum query price. Cite each verified offering rather than assigning a universal floor to every vendor. [Nansen pricing](https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai), [Allium pricing](https://docs.allium.so/ai/machine-payments/endpoints-pricing), [Dune MPP](https://docs.dune.com/docs/agents/mpp).

At Testril's observed rates, a prepared 100-block read costs **$0.00012 (0.012 cents)**. Fifty such purchases total **$0.006 (0.6 cents)**. This gives the first demo a concrete economic reveal before function creation ships. Provenance and materializer earnings then show what else the same underlying product makes possible. Section 8 defines the comparison and preparation costs.

| USP | Customer-facing promise | What the demo must actually show |
| --- | --- | --- |
| Very small payments | Make many useful decisions within a one-cent allowance | Distinct selective checks, sub-cent quotes and receipts, accumulated cost, enforced budget; separately disclose preparation |
| Functions created on request | Extend the data product when your question needs new computation | Catalog miss → new validated executable function → persistent identity → result → independent reuse |
| Earnings from materialization | Useful data can offset its preparation cost through other buyers | Separate payer/reader, actual eligible paid read, observed earnings delta, eventual payout |
| Provenance | Defend the number with its sources and calculation | Scope, source block references, function identity, transformation, independently checked example |

Avoid “we have chat,” “no SQL,” “another dashboard,” or “we accept USDC” as the central reveal. Avoid claims that competitors cannot audit data. Compare complete tasks with matched scope, including cold preparation, client processing, and onboarding costs.

### How the series advances the replacement ambition

| Workflow we want to win | First demonstrable foothold | What a broader replacement still needs |
| --- | --- | --- |
| Dune-style analysis and reporting | A reproducible treasury case, then a newly defined metric | Broad useful catalog, long histories, shared definitions, recurring reports, dependable aggregate serving |
| Allium-style application data delivery | A conventional endpoint serving the same answer and evidence | Stable schemas, service reliability, throughput, billing/support, wider normalized coverage |
| Nansen-style wallet and protocol intelligence | Address-level flows and explicitly defined behavioral cohorts | Credible entity labels and attribution, price/cost-basis inputs where needed, stronger market coverage and validation |

This is a progression of customer jobs to win. The demos do not establish parity with those platforms' entire catalogs or proprietary datasets.

## 3. What can be promised now

On 3 October, `dev.testril.ai/mcp` reported version **0.2.2**, payment mode **`cdp`**, three functions, and configured data chains **Ethereum, Arbitrum One, and Base Sepolia**. Its function catalog contained `erc20_balance`, `erc20_transfer_volume`, and `erc721_owner`. Free metadata calls succeeded; we did not purchase data, test payout, or establish the deployment's payment network. See the [captured observations](research/2026-10-03-live-baseline.json).

The product baseline is explicit binding, materialization, paid reads, metadata inspection, and source-block provenance. Working demos and acceptance tests still need to establish the complete purchase-to-delivery path on the chosen deployment.

Three independent readiness axes matter:

1. **Function availability:** existing catalog; new functions implemented by us; customer-requested function generation. Only the last is USP 2.
2. **Access:** direct wallet, sponsored evaluation, or proposed card/API gateway. The gateway does not require USP 2.
3. **Execution evidence:** synthetic fixture, recorded real run, live testnet settlement, or live mainnet settlement. Name the mode on screen.

Some repository prose still describes earlier JSON authoring, while the current function roadmap moves toward static Rust functions and defers runtime generation. Follow the user's stated product boundary: **USP 2 is not shipping**. A language model choosing or binding a prewritten function is a pre-2 experience.

The planned native-function engine, function dependencies, richer entity storage, timestamp windows, and per-cell input lineage are separate dependencies. A new function may be quick once its inputs and output shape are supported; an engine feature is not a quick function addition. The [function briefs](function-briefs.md) identify that distinction.

Current source also shows an ungated REST data path despite broader parity language elsewhere. All commercial demo reads must go through the paid MCP path until REST behavior is verified and reconciled. This is a concrete product prerequisite for the gateway, not a reason to defer the first MCP demo.

## 4. The portfolio

**P = before function creation. G = after function creation.** Effort is relative and conditional on the dependency gates below. A marketing episode may reuse an application already built.

| ID | Demo / hook | Primary audience | Leading USPs | Required functions | Priority |
| --- | --- | --- | --- | --- | --- |
| P0 | **One Cent, Many Decisions** — an agent makes useful selective checks within a penny | Agent/app developers | Sub-cent purchases, provenance | Existing transfer volume; exact balance optional | Opening marketing episode and first runnable release |
| P1 | **Follow the Money** — explain the treasury outflow before the meeting | Builders, protocol operations | Useful answer, provenance, bounded spend | F01 transfer edges; existing exact balance if available | First flagship |
| P2 | **The Second Customer Pays You** — another app buys your prepared data | Builders, data sponsors | Materialization earnings, payments | Reuse P1 or existing transfer volume | Second flagship episode |
| P3 | **Show Me the Evidence** — challenge a chart and reproduce the number | Engineers, data teams | Provenance | Reuse P1 | Film/export mode inside P1 |
| P4 | **Did Liquidity Leave?** — distinguish trading activity from liquidity withdrawal | DeFi builders, protocol teams | Useful custom data, provenance | F02 swaps and F03 pool liquidity state | Optional vertical after first feedback |
| P5 | **Ship the Endpoint** — turn the case file into a normal product API | Application teams | Easy integration; payment flexibility | Reuse P1 plus gateway | Pilot after repeat demand |
| G1 | **The Metric That Didn't Exist** — a customer invents a vault metric in the room | Developers, analysts | Creation, provenance, payment | F04/F05 vault foundations; generated G01 | First post-2 flagship |
| G2 | **Did the Campaign Stick?** — change a retention definition and get a defensible cohort | Growth/data teams | Creation, provenance | F01/F05 plus generated G02; stateful engine | Second post-2 episode |
| G3 | **Ask → Build → Earn** — a new metric becomes a reusable paid data product | Platform buyers, investors | All four | Compose G1 and P2 | Capstone; earn it through earlier releases |

### P0. One Cent, Many Decisions

**Situation.** A developer needs to locate unusual token activity within prepared historical coverage. The agent checks narrow windows, follows promising activity, and stops when it has enough evidence or reaches its allowance. Cheap selective follow-ups make this interaction practical.

**60–90 second sequence.** Open with “Give this agent one cent to investigate.” Show the sponsor's prepared coverage and its separate cost. Set an explicit transfer-count threshold; inspect short windows and choose follow-ups from the returned counts. A timeline reveals the checked windows and the reason for each next step. Keep the question, result, exact scope, charge, and remaining allowance together. End with the useful finding and total, then show an over-budget request stopped before signing.

**Economic reveal.** At current rates, fifty separate 100-block cached reads cost $0.006. This is a budget illustration to validate in rehearsal, not a requirement to make fifty calls. Film a genuinely useful sequence and display its actual count and receipts. Alongside it, an explicitly labeled pricing model shows the same number of paid requests at one-cent and five-cent floors. It is not a measured competitor workflow.

**Useful output.** A timeline of activity checks, the selected windows with source references, and a runnable consumer that chooses its next request from the previous result. Report “no threshold crossing found in checked windows” when appropriate; do not imply complete coverage of unqueried history or infer treasury flows from token-wide volume.

**Build.** Existing transfer volume, a small deterministic selection policy, payment helper, budget enforcement, exact decimal charge display, and one chart. No new backend function or runtime function creation is required. An LLM may explain the evidence; the narrow selection example remains runnable without one. Publish optional LLM and reference-RPC costs separately from Testril read charges.

**Honest reveal.** “One cent” is the cached-read allowance. Funding, cold preparation, and retention are separate. Never pad the sequence with redundant reads to manufacture a cost ratio. When the entire required scope is known, compare a bulk read too; selective purchasing earns its place when later scope depends on earlier results or early stopping saves work.

**Pass / next step.** A new developer reproduces a useful multi-step result unaided, every decision has a receipt, and an oversized quote sends no signature. CTA: “What could your agent check if each step cost a fraction of a cent?”

### P1. Follow the Money — the first flagship

**Situation.** A protocol team sees a token balance fall and needs an answer before a meeting. Its developer supplies a treasury wallet, one standard ERC-20, a finalized historical window, and optional team-owned addresses.

**The first screen.** “Where did this treasury's USDC go?” A visible budget sits beside Run. Use a real case chosen for an understandable pattern, not a promise that an anomaly exists. No finding is scripted before inspecting the data.

**Three-minute storyboard.**

1. **0:00–0:20 — the question.** Choose the case, state its exact scope, and approve the quote. Cached and new work have separate lines.
2. **0:20–1:00 — the answer.** A flow diagram and ranked counterparties explain gross outflow, inflow, and net movement. A balance change ties the story to something the team recognizes.
3. **1:00–1:40 — the useful twist.** Toggle the supplied operational-wallet set. Separate internal transfers from external outflow. Addresses remain addresses unless a documented source or the customer supplied their labels.
4. **1:40–2:15 — the challenge.** Click a number. Show exact integer inputs, window, function identity, source blocks, and the calculation. An unexplained remainder stays visible.
5. **2:15–3:00 — the developer wins.** Export the case file and the small consumer example. Change an address or threshold using the same fixed function. End with the total actually charged.

**Build.** F01 `erc20_transfer_edges`; two point-in-time balance reads for reconciliation; a small deterministic client reducer; flow diagram; evidence/export drawer. The LLM may select calls and narrate verified calculations, but it does not add numbers or assign wallet identities.

**Reconciliation rule.** For `[a,b)`, compare end-of-block balances at `a−1` and `b−1` against incoming minus outgoing Transfer amounts. Both point snapshots must be materialized. Self-transfers cancel. This exact equality is valid for the selected ordinary token; rebasing, fee-on-transfer, and nonstandard balance mechanics require explicit handling or a different fixture.

**Scope discipline.** One chain, one token, one window, one user-supplied wallet group. No “all stablecoins,” guessed exchange labels, wallet identity intelligence, tax P&L, or claim that movement proves intent. Raw amounts stay integers; token decimals are metadata; a USDC-denominated chart is not a historical USD valuation engine.

**Pass / CTA.** Independent reproduction matches the chosen result and explains every excluded category. At least one target developer can use the case file in an existing workflow. CTA: “Bring one treasury question; we'll run it together.”

### P2. The Second Customer Pays You

**Situation.** The first team funded data preparation. A separate reader needs the same function, parameters, and range. Mere similarity of business questions is insufficient for reuse.

**Two-minute sequence.** Split the screen between the supplier's purchase and a reader's application. Show what the supplier paid and the covered range. The reader pays for a stated read. The supplier's actual earned/unclaimed amount increments; coverage and its earning expiry remain inspectable. Show that replaying that same paid request does not create another earning event.

**Use a real work product.** The second reader exports a reporting card or runs a budgeted monitor over the same materialized data. A refresh button that only exists to pump revenue is a weaker story.

**Claim moment.** A 1,000-block read currently allocates approximately $0.0005 to a sole eligible supplier. Twenty separately paid such reads reach $0.01, subject to rounding and eligibility. Either show honest sub-cent accrual, or use a clearly labeled prior-demo balance and let the live read cross the claim floor. A payout clip requires a funded rewards wallet and an observed successful transaction. Never imply a testnet payment is real revenue.

**Existing assets.** Reuse or deep-link the wallet/accounting experience in `testril-claim`; adapt its integration and precision handling where useful. Verify the deployed purchase-level fields instead of assuming its README or another branch matches the server.

**Pass / CTA.** Distinct reader and supplier accounts, documented funding origin, exact before/after accounting, no new materialization for the reused interval, and a receipt for any claimed payout. Operator-funded demo traffic is labeled as demonstration activity. CTA: “Which dataset would your users pay to reuse?”

Use a dedicated rehearsal deployment or attributable purchase-level accounting so unrelated concurrent traffic cannot be mistaken for the reader's earnings delta. The original payer supplies availability, not copyright ownership of public chain facts.

### P3. Show Me the Evidence

**Situation.** A colleague challenges the flow chart. The engineer opens a compact evidence bundle rather than defending an AI paragraph.

**90-second sequence.** Open a result → inspect block references and computation → rerun a small independent reference calculation → deliberately change the local display amount → rerun verification and observe the mismatch.

**Verification layers.** The existing provenance digest binds an enumerated source-block set; it does not independently prove a numeric result correct. A result hash can detect changes relative to a trusted receipt, but a self-authored hash is not attestation. The stronger demonstration re-fetches the relevant chain logs/state at pinned blocks and recomputes the same result. State which checks passed: block consistency, source consistency, arithmetic reproduction. Reference RPC trust remains part of the result.

**Deliverable.** An evidence bundle containing chain/contract, `[from_block,to_block)`, function version or inspected definition hash, parameters, returned values, provenance responses, client calculation version, receipt, and verification instructions. Hash values and the calculation manifest separately from Testril's source-block digest. For a derived answer, preserve all contributing source bundles.

**Pass / CTA.** Untouched data reproduces; a changed number fails arithmetic comparison; a changed source hash fails the source check. This is an audit trail with reproducibility, not a zero-knowledge proof or a completeness guarantee about all onchain activity. CTA: “Verify this result yourself.”

### P4. Did Liquidity Leave?

**Situation.** A DeFi product needs to explain activity in one known Uniswap v3 pool. A volume spike alone cannot establish whether active liquidity fell.

**Two-minute sequence.** Select the historical pool incident → compare swap activity with active-liquidity snapshots → drill into the blocks where the series diverge → export a finalized-data alert rule.

**Build.** F02 `uniswap_v3_swaps` and F03 `uniswap_v3_liquidity_state`; exact token metadata; a deterministic comparison view. Prefer a single pool and a short interval. Active liquidity is not total TVL; swaps alone do not identify LP withdrawal or economic causality. If explaining mint/burn causality is required, request a separate position-event function before making that claim.

**Pass / CTA.** Swaps agree with reference events; snapshots agree with pinned contract calls; the display states finality lag. This is historical diagnosis or finalized-data monitoring, not a mempool signal, execution bot, or promise to warn before an exploit. CTA: “Put this pool check in your product.”

### P5. Ship the Endpoint

**Situation.** A builder likes the answer but needs a normal authenticated HTTP endpoint, predictable spend, and no wallet code in their application.

**Two-minute sequence.** Select the P1 dataset → enable a capped usage allowance → obtain an API credential → paste a small `curl` example into a familiar app → compare the JSON and provenance with the direct-wallet result → inspect usage and remaining allowance.

**Build.** A bounded gateway pilot: tenant credential, server-held payer, upstream MCP purchase loop, usage ledger, idempotency, spending cap, and a read endpoint pinned to an existing bound function. Card checkout may initially use a visibly labeled test environment. A fixture gateway is a concept demonstration, not a shipping SaaS offering.

**Pass / CTA.** The same scope produces equivalent data and evidence by both access paths; a retried customer request is billed once; the next over-cap request is refused. CTA: “Connect one endpoint to your application.” The detailed ownership and billing proposal is in §7.

### G1. The Metric That Didn't Exist

**Situation.** A vault's campaign targets smaller depositors, but headline deposit volume cannot show whether it reached them. The team asks: “For this vault, split deposits by the owner's USDC balance immediately before the deposit's block, excluding our operational addresses.” That balance is a defined onchain segment, not a person's wealth or identity. The catalog deliberately lacks that computation. Simply binding a new vault address would not demonstrate creation.

**Four-minute sequence.**

1. Show the catalog miss and a precise proposed definition: owner versus sender, balance block, cohort boundaries, exclusions, and output units.
2. Confirm the computation and maximum creation cost. Generate a new executable function with a new identity.
3. Show meaningful validation: known example, boundary value, excluded wallet, same-block deposit, and unsupported-source refusal.
4. Quote and materialize a narrow window; return the cohort result and input lineage.
5. A fresh client discovers and uses the new function without regenerating it. A second paid read can feed the earnings episode.

**Build.** F04/F05 seed vault context and fixtures. G01 is generated during the demo, with historical state reads supported by the generation/runtime contract. If that contract cannot safely express the rule, say so and choose a supported new computation rather than presenting an off-server script as a Testril function.

**Creation acceptance gate.** New durable code/definition, explicit parameters and output types, deterministic execution, enforced resource limits, validation before paid work, versioned identity, reproducible provenance, and independent reuse. Creation cost, preparation cost, and read cost are separate. The current `llm_tokens` rate is not a committed price for the future authoring product.

**Honesty under pressure.** A rehearsed recording is labeled; a supported prompt family is disclosed; elapsed generation time remains visible. If a human must review code, show that review or a time cut. Include an unsupported request so the audience sees the boundary. CTA: “Bring the metric your current data product can't express.”

### G2. Did the Campaign Stick?

**Situation.** A protocol asks whether a campaign attracted repeat depositors or temporary activity. Its analyst changes the definition in the room: repeat deposit on a later UTC day, exclude supplied operational addresses, and evaluate net withdrawals through a stated observation cutoff.

**Three-minute sequence.** State the rule and observation horizon → create the cohort computation → show eligible and censored cohorts separately → change a meaningful part of the rule → generate a new version → compare definitions and results with their input lineage.

**Build.** G02 stateful cohort computation, complete baseline history, UTC block timestamps, owner-level attribution, and traceable dependencies. Vault-share transfers, partial withdrawals, and assets-versus-shares need a chosen accounting convention. Do not call partial observations failed retention or addresses unique humans.

**Why post-2.** Cohort analysis can be prebuilt before USP 2. This episode belongs here because the customer authors a previously unavailable rule during the demonstration. Rebinding an existing threshold is not its reveal.

**Pass / CTA.** An independent fixture calculation matches both versions; immature cohorts are censored; prior versions remain reproducible. CTA: “Replace one disputed growth metric with an agreed, reproducible definition.”

### G3. Ask → Build → Earn

Combine G1 and P2 into a five-minute launch film: customer asks for a missing metric; Testril builds and validates it; one party funds preparation; a second customer buys the resulting data; the supplier sees its share; both customers can inspect the evidence. Use actual observations from earlier working demos.

Do not imply that a function author earns code royalties. Today's earning right attaches to eligible materialization. Author compensation, exclusivity, licensing, and ownership of generated code are separate product decisions. The closing ask is a design partnership around a real missing metric, not passive-income speculation.

## 5. Functions, client work, and backend gates

The initial request is deliberately small: **F01 transfer edges**, plus confirmation that exact raw balance snapshots are available. The existing transfer-volume function supports P0/P2 while F01 is built. It cannot identify senders or recipients, and must not be presented as a substitute for F01.

| Backend delivery | What it unlocks | What remains client-side |
| --- | --- | --- |
| Existing balance / transfer-volume / owner | P0, initial P2 | Formatting, bounded comparisons, payment flow |
| F01 transfer edges | P1 and P3 | Wallet-group filtering, net sums, rankings, diagram, evidence export |
| F02 swaps + F03 liquidity state | P4 | One-pool comparison and alert presentation |
| F04 vault state + F05a deposits / F05b withdrawals | Seed cases for G1/G2 | Definition UI and compact report |
| Safe function-generation product + G01 | G1 | Definition confirmation and validation display |
| Stateful generation + G02 + input lineage | G2 | Cohort comparison and censoring presentation |

Client calculation is acceptable for the bounded early demonstrations, but label it accurately and publish the calculation. Do not claim server-side aggregate answers, low agent token usage, or complete transformation provenance if the application does the missing work. For large datasets, a stored aggregate function becomes a real backend requirement.

No portfolio item silently assumes price feeds, native-asset traces, Solana, identity labels, address-cluster intelligence, arbitrary cross-chain joins, or historical P&L. Each would require its own data/source work. Detailed semantics, edge cases, fixtures, and capability dependencies are in the [function briefs](function-briefs.md).

## 6. Turn the wallet into useful capability

The positive story is **a programmable purchasing identity with a visible allowance**: the same buyer can authorize scoped work, inspect receipts, and receive eligible materialization earnings. The visible payoff is an agent making many small, independently authorized purchases from one allowance, then receiving eligible earnings when it supplies useful data. Show that value before asking the visitor to set up a wallet.

Offer three entrances to the same demo:

| Entrance | Experience | Ownership and limits |
| --- | --- | --- |
| Watch / recorded case | Immediate result and evidence, no wallet setup | Clearly recorded; no live payments or earnings implied |
| Sponsored live trial | Click Run; a small sponsor-funded allowance buys real work | Server-held signer, per-session and global caps, fixed safe examples; sponsor is the payer |
| Bring a wallet | User funds/chooses the configured payment network and approves a budget | User controls payment and eligible earning rights; separate consent for escrow deposit |

A sponsored visitor is not silently given ownership of the sponsor's title. For P2, use clearly identified independent reader and supplier roles. A provider onboarding flow can offer a wallet connection only when the user elects to supply data or receive earnings.

### Payment-client requirements

- Display maximum spend before signing; enforce per-operation, per-session, total, and concurrent-request reservations outside the LLM. A prompt is not a spending control.
- Keep keys in a signer process or wallet; expose narrow operations to the agent. Do not ask public demo users to paste private keys into a web form or chat. Reuse tested signing logic from the existing demo site where appropriate, not its entire investor-room application.
- Inspect available channels and use the server's quoted network/asset/receiver. Data chain and payment chain are separate; never assume Ethereum data means Ethereum payment.
- Support the advertised batch-settlement path. A generic x402 `exact` example does not establish compatibility with Testril's sub-cent flow. The batch scheme uses escrow plus cumulative off-chain vouchers, reducing per-request chain settlement. [Official scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md).
- Serialize voucher updates per channel, reserve spend before issuing concurrent work, and reconcile uncertain outcomes before retrying. Never sign the entire deposit as a tiny request's charge ceiling.
- Show **deposited**, **authorized/charged**, **unspent escrow**, and **paid out** distinctly. A deposit is not a query expense. A voucher is not a separate onchain transfer on every read.
- Handle Testril's `payment_required → pay_quote → verb(payment_id)` tool flow. Do not assume an MCP tool response is an HTTP 402 middleware retry.
- Quotes expire after 120 seconds in the current implementation. Refresh an expired quote and recheck the budget; do not blindly pay twice after an uncertain response.
- Explain the current escrow withdrawal path: initiation, delay, finalization; no current MCP withdrawal tool. Do not promise instant automatic cash-out or reuse of the same escrow with unrelated providers.

These are a small client's behavioral requirements, not an invitation to build a wallet platform. Ship one readable working path first. Reuse a tiny helper only after the second demo exposes the same need.

## 7. Recommendation on the SaaS layer

**Build it as a distribution layer over the same paid product.** Conventional buyers get familiar procurement and REST integration; wallet-native buyers retain direct programmable access. Choosing a card should not change a metric's semantics or destroy its provenance.

Preserve the direction of the stack: **tiny protocol purchases first; conventional commercial packaging above them**. Keep sub-cent precision in the tenant usage ledger and aggregate at invoice time. Do not introduce a one-cent minimum per underlying read. A disclosed service fee or subscription can cover gateway costs without rounding every tiny operation upward.

The primary benefit is broader adoption. x402-only access otherwise selects for developers willing to manage a wallet before evaluating the answer. Card/API access can ship entirely in the pre-2 phase.

### Minimal useful pilot

```text
Customer app ── API credential ──> Testril gateway ── paid MCP / x402 ──> Testril
                                      │
                               tenant usage ledger
                                      │
                            card credit / subscription
```

The first gateway exposes a pinned, existing function and bounded scope; it does not accept arbitrary expensive jobs. A synchronous read returns data and an evidence reference. Cold preparation becomes an explicitly priced asynchronous job with status, cancellation semantics, and a spend ceiling. Endpoint names and versioning are a design decision for implementation, not a claim about today's `/v1` routes.

Start with a paid allowance or prepaid usage credit and an optional recurring plan with included usage. Aggregate card charges rather than attempting a card transaction for each micro-read. Overage is opt-in and capped. Model card processing, hosting, support, RPC, LLM usage, settlement overhead, working capital, refunds, and abuse before setting a retail price. Testril's underlying data charges remain separately measurable.

### Resolve the supplier question explicitly

**Recommended MVP:** the gateway funds materialization, holds the resulting onchain claim right, and sells a data service. A tenant receives a materialization rebate as **service credit** only if that product promise is explicitly implemented. It is not automatically an NFT owner or a USDC recipient. Maintain an auditable mapping of customer charges, upstream purchases, eligible earnings, credits, and payouts.

**Optional later mode:** a dedicated customer-controlled or delegated payer wallet lets the customer hold the protocol entitlement directly. That is an additional custody, authorization, and support product; it is not necessary to make a normal REST read work.

Do not quietly retain supplier earnings while marketing them as the customer's. Equally, a subscription invoice does not automatically create read rewards: only qualifying upstream paid reads do. If the gateway serves a cached response ten times after one upstream purchase, it must not report ten Testril earning events. Decide whether the gateway buys each served read or offers separately described cached delivery before pricing it.

### Operational acceptance

Credential isolation, request idempotency, concurrent budget reservations, rate limits, tenant ledgers, deterministic retry/reconciliation, evidence preservation, actual upstream payment, and clear failure responses are launch requirements. Do not turn the currently ungated REST path into an apparent x402-backed service. Spend limits apply before any signature; a browser-controlled request cannot choose the payer, receiver, or arbitrary upstream endpoint.

Run a pilot with a few developers who otherwise reject wallet onboarding. Measure first successful request, onboarding abandonment, repeat usage, support time, and contribution margin. Advance to subscriptions and broader endpoints on evidence of repeat use. The gateway can outgrow this demos repository when it has independent operational ownership and release needs.

## 8. Economics the demos must display

Live published rates on 3 October were:

```text
materialize = unpaid hole-blocks × $0.00012
extra hold = unpaid hole-blocks × extra days × $0.000001
stated read = $0.00002 + requested blocks × $0.000001
```

These formulas describe one bound function and omit any additional authoring line. Multiple functions and separate reads add their own charges. New source-aware pricing is planned; runtime quotes are authoritative.

| One bound function | New materialization, 24h included | One cached stated read |
| --- | ---: | ---: |
| 100 blocks | $0.012 | $0.00012 |
| 1,000 blocks | $0.12 | $0.00102 |
| 7,200 blocks, reported Ethereum day estimate | $0.864 | $0.00722 |
| 321,190 blocks, reported Arbitrum day estimate | $38.5428 | $0.32121 |

Consequently, “investigate for a few cents” can be true for a small or prepared scope and false for a cold broad one. State the exact scope and preparation sponsor. Do not disguise a smaller Arbitrum block interval as a full day. Existing `blocks_per_day` is an estimate, not a timestamp conversion; use actual verified boundaries for dated stories.

### Show the economic granularity

| Illustrative request sequence | Testril cached-read charges | At $0.01 per request | At $0.05 per request |
| --- | ---: | ---: | ---: |
| One 100-block read | $0.00012 | $0.01 | $0.05 |
| Fifty separate 100-block reads | $0.006 | $0.50 | $2.50 |

The last two columns model call-price floors; they are not measured equivalent competitor queries. Named comparisons need matching scope, output, freshness, batching, pagination, and setup. x402 itself does not impose those floors, and competing providers can change their offers. Our claim rests on the useful paid units Testril actually delivers.

For fifty distinct 100-block windows of one bound function, preparing all 5,000 blocks from cold costs $0.60 at these rates, before retention and external costs. Disclose that sponsor investment. A single read of all 5,000 contiguous prepared blocks costs $0.00502, less than fifty small reads. Use selective calls when each answer determines what to buy next; measure unused scope and early stops as well as request count.

Render charges with sufficient precision: $0.00012 must never appear as “$0.00” or “free.” Keep per-read prices distinct from the recommended escrow top-up and the separate $0.01 reward-claim threshold. Low read prices do not imply equally small onchain deposits or payouts.

For a 1,000-block range with one eligible materializer, the current source's 50% share of the variable read fee yields $0.0005 per full-range paid read. That offsets a $0.12 initial materialization after **240** such reads, before any other costs and only while eligible. Revenue is not profit. The base read fee contributes no reward, partial coverage changes allocation, and an unstated latest-block read has no variable-line reward. These are illustrative mechanics, not promised returns or measured demand.

Use 100–1,000 block scopes for development. For the earning story, retain a known fixture long enough to rehearse by explicitly purchasing extra cache-days. A cold range must actually have holes: inspecting coverage before the show prevents promising a new supplier right on already-funded data.

### Suggested rehearsal envelopes

- P0: up to $0.01 in cached data-read charges; preparation and any escrow top-up disclosed separately.
- P1: initially one 1,000-block F01 range, two one-block balance snapshots, and a $0.50 data-work cap. This is a planning envelope, not a price promise; reference-RPC and LLM costs are additional and tracked.
- P2: the same prepared range; twenty 1,000-block reads cost $0.0204 and allocate approximately $0.01 to its sole eligible holder. Artificially buying one's own traffic spends more than it earns and is not evidence of demand.
- P4/G1/G2: no fixed marketing price until the exact function graph and warm/cold scenarios are quoted and measured. The first generation demo has a separate authoring cap.

No financial transactions were executed to develop this plan. Rehearsal budgets above are recommendations for implementation, not standing authorization to spend.

## 9. Production of the demos

### One understandable result before machinery

Open on the customer's problem and a visible answer. Keep the quote and total cost near the result. Let the audience expand provenance, raw responses, and signatures as needed. The initial frame is not an MCP tool picker, NFT inventory, or terminal log.

Use Testril's existing visual identity: olive, cream, muted gold, and approved brand assets. Prefer a focused flow chart, two-party earnings view, and evidence drawer over a giant multi-tab dashboard. Technical transparency is available on demand rather than imposed on every viewer.

Each flagship produces a 15–30 second result clip, 60–90 second story, three-minute walkthrough, runnable public example, and a result/evidence artifact. The developer version includes the full purchase flow and failure behavior. The short film may cut waiting time, labeled with actual elapsed time.

Release P0 with the measured sub-cent purchase sequence and readable script. Introduce P1 through a concrete case and a “bring your question” invitation, then release P3's engineering walkthrough and P2's reuse reveal. Put short result clips where target builders already discuss agent integrations, the reproducible walkthrough beside the repository, and the case file in direct customer sessions. Use the same result and measured costs across all versions. The conversion offer is one bounded working session ending in an agreed metric, price, and evidence artifact, followed by an integration pilot. Distribution and customer outreach are proposed marketing work; this planning task sends no messages or campaigns.

### Fixture and rehearsal contract

Choose a public Ethereum case first, subject to archive-RPC access and an interesting short window. Maintain one synthetic fixture with explicit expected values for correctness and a separately labeled historical case for credibility. A synthetic treasury is not evidence about a real protocol.

Each case manifest records chain, contracts and verified interfaces, decimals, exact half-open block ranges, readable UTC times, function identities, expected output, independent reference, payment network, settlement mode, coverage state, expiry, and warm/cold cost. Fixture selection is a deliverable of phase 0; no specific historical finding or address is asserted by this plan.

Measure output cardinality as well as block count. A token-wide F01 window can contain many counterparties even when it is short. Target at most 5,000 edge rows in the first fixture, reduce them deterministically before narration, and narrow the window if the payload exceeds the demo's measured budget. Larger investigations need a scoped or stored-aggregate function; an inexpensive quote does not imply a small response.

Rehearse a warm success, cold job, failed peer, uncovered range, expired quote, over-budget refusal, and an uncertain payment retry. Never fill a failed live chart with fixture data without an explicit mode switch. Recorded fallback shows recording date and mode. Finalized data is labeled with an as-of time, never called real-time if its lag makes that misleading.

Measure cold and warm latency, complete task cost, quote/pay/read stages, external reference costs, LLM tokens, and time to first result. Use several runs and report range/median initially; do not present a percentile from a tiny sample. Proposed usability targets: result visible within 30 seconds on the warmed flagship; fresh developer gets a first paid result in ten minutes; payment refusal is clear before signing. These are acceptance targets to validate, not measured performance claims.

### Public repository shape

Keep application source, fixture manifest, checks, and README in each `demos/<name>/`. Suggested first directory: `demos/follow-the-money/`; P3 is a mode of it. A separate small supplier example can power P2 and connect to the existing claim UI.

Each README should answer: what this demonstrates, prerequisites, three or fewer main run commands, configuration, what success looks like, and how to reproduce the reference result. State funding needs and simulation modes before the run command. Prefer a short runnable example over a generic client framework. The overview indexes outcomes; technical design belongs in supporting documents.

Split a demo into a separate repository when it acquires an independent release schedule, incompatible setup, a production service owner, or dependencies that make the rest harder to run. Multiple folders alone are not a reason to split.

## 10. Delivery sequence and decisions

These are planning ranges in **active builder-days**, excluding backend platform work, deployment approvals, protocol upgrades, and customer scheduling. They are not calendar commitments. One engineer can build the first cluster sequentially; backend/function review is separately needed.

| Phase | Work / owner role | Planning range | Exit evidence |
| --- | --- | --- | --- |
| 0 | Baseline, real fixture, reference calculation, wallet purchase harness / demo engineer + backend owner | 2–4 days | Known paid path and mode; matched reference; cold/warm costs; P0 selective sequence and sub-cent receipts |
| 1 | F01 + exact balance support / backend engineer | 1–3 days if current engine supports the shape | Function brief acceptance; additional engine work separately estimated |
| 1 | P1 case file and P3 evidence / demo engineer | 4–7 days | Reconciled case, export, verifier, readable integration |
| 2 | P2 reuse and earnings / demo engineer + backend owner | 2–4 days | Independent buyer, correct attribution, honest accrual/payout mode |
| 2 | Packaging and customer walkthroughs / demo engineer + marketing owner | 2–3 days | Recordings, concise READMEs, five observed evaluation sessions |
| 3a | P4 vertical / function + demo engineers | Estimate after native engine gate | Swaps/state reference match and audience demand |
| 3b | P5 gateway pilot / service engineer | 7–12 days for a narrow prototype | Capped conventional REST workflow; billing/retry tests; card mode disclosed |
| 4 | G1 then G2 then G3 / authoring platform owner + demo engineer | Unestimated until authoring/runtime gates exist | New durable computation, meaningful tests, traceable inputs, independent reuse |

**Recommended commitment:** phases 0–2, roughly **11–21 active builder-days including the conditional F01 slice**, then choose P4 or P5 using feedback. Backend migration work is outside this range. Do not wait for function creation to release the pre-2 cluster.

The native-function work already has an ordered engine/subgraph/library roadmap in the core repository. Present F01 as a small, justified demo-priority request to its owners; do not silently reorder that roadmap or fork the engine. If it cannot land quickly, publish P0/P2 with existing transfer volume while P1 waits. The complete treasury explanation remains gated on F01.

### Marketing experiments and continuation gates

Recruit five developers from agent/app teams and three protocol/data operators. Ask each to bring one actual task. Observe setup, what they trust, which result they can use, and whether they return with a second question. Praise is weaker evidence than a repeat task or integration.

Track the funnel: viewed result → opened evidence → ran example → first successful paid result → changed scope → returned within seven days → requested integration. Ask what they would build with cheaper fine-grained checks; test whether they can name a changed workflow, not just repeat the price. Track wallet abandonment separately from product-value rejection. Record actual payer/sponsor, total spend, support time, successful payments, and repeat reads from independent users.

Proposed early continuation gate: at least three of five developers complete the first run without live assistance; at least two return with a second real task; at least one asks to integrate or pilot. Small samples guide iteration, not market-size claims. If users admire the animation but cannot name a use, change the case. If value is clear but wallet setup kills adoption, prioritize P5. If the first question repeatedly exceeds the catalog, prioritize the relevant fixed functions and the authoring product.

### Decisions for review

1. Confirm the first audience and treasury-investigation flagship, or choose P4 if a real DeFi customer supplies a stronger case.
2. Assign a core owner to the F01/exact-balance request and determine whether the existing engine can support it before the native-function migration.
3. Choose a real case and reference source; name the payment network and live/testnet mode for rehearsals.
4. Decide the sponsored-trial allowance and the gateway's supplier entitlement/credit policy.
5. Agree the observable gate for USP 2; reject a rebranded binding demo as its launch.

The next implementation unit should be phase 0's fixture and paid purchase harness, followed by F01's accepted contract. All other portfolio items remain scoped options until those results and customer feedback justify them.
