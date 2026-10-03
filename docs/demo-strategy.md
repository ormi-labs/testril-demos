# Testril demo plan: implementation details

**Proposal · 3 October 2026**

Start with the [two-page summary](demo-summary.md). The [application and download specifications](demo-deliverables.md) describe the screens, source archives, and run exports; the [treasury screen sketch](treasury-preview.svg) illustrates the proposed main result. The [function requirements](function-briefs.md) specify backend changes. The [research notes](research/baseline.md) record deployment observations, code references, and competitor pricing. Recheck prices and deployment behavior before building or recording a demo.

## 1. Purpose and audience

Build examples that engineers can run, understand, and adapt to their applications. Each demo must produce a useful result, show its cost, and provide enough information to check it.

The first users should be agent and application developers working with protocol treasury or operations teams. Release three independently runnable downloads: a token-activity CLI, a treasury web application with its own client and verifier, and a separate paid-reader CLI. The treasury application combines analysis, result verification, and the supplier earnings view. A website index and recording present these together. Later, add a separate vault analysis application for function creation.

The first result should be a usable report, not just a successful API response. A synthetic treasury example starts at 1,000 USDC, receives 50, sends 100, and closes at 950. Its transfer diagram and counterparty table explain the −50 change; selecting an amount opens its source details. The developer can verify the report, export that run, or download the runnable application. The [screen sketch](treasury-preview.svg) shows this proposed layout.

Four capabilities determine the work:

| Capability | What the demo must demonstrate |
| --- | --- |
| Very small payments | Useful reads costing less than one cent, with quotes, receipts, and enforced spending limits |
| Functions created on request | A missing computation is generated, tested, registered, executed, and reused by another client |
| Earnings from materialization | A separate customer's paid read increases the eligible materialization holder's earnings |
| Provenance | A result identifies its sources and calculation; an independent check can reproduce it |

**Materialization** means preparing and storing computed data for later reads. **Binding** supplies a function's parameters, such as chain and token address. **Provenance** records the sources used to produce a result. These operations do not by themselves establish that the result is correct; the verification demo also checks the calculation.

| User | Task | Required output |
| --- | --- | --- |
| Application developer | Add an onchain data check to a product | Small runnable client, predictable spending, usable response |
| Treasury or operations team | Explain a token balance change | Incoming and outgoing amounts, counterparties, reconciliation |
| Data engineer or analyst | Answer a question requiring new computation | Reusable function, precise definition, reproducible result |
| Data supplier or sponsor | Fund useful data for other readers | Preparation cost, paid reuse, earnings, payout records |

Replacing Dune, Allium, and Nansen remains the long-term objective. These demos cover a few tasks. Broader replacement requires more data and functions, reliable service, and established definitions. Wallet intelligence also requires credible entity labels and attribution; the initial demos use addresses and labels supplied by the customer.

## 2. Small payments and competitor pricing

Make payments below one cent visible in the first demo. An agent that chooses its next request from the previous result may need many small reads. Charging one or five cents for each request can make those checks expensive even when each returns little data.

Testril is being built around small paid operations, materialization, and reuse. A conventional API and card billing can sit above those operations. Competing products have added machine payments to existing APIs. The relevant comparison is the smallest useful purchase they sell, not whether they support a payment protocol.

Published prices checked on 3 October:

| Provider | Published offering | Price |
| --- | --- | --- |
| [Nansen](https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai) | Basic / premium calls | $0.01 / $0.05 |
| [Allium](https://docs.allium.so/ai/machine-payments/endpoints-pricing) | SQL submission / price endpoints / wallet endpoints | $0.01 / $0.02 / $0.03; SQL results priced separately |
| [Dune](https://docs.dune.com/docs/agents/mpp) | Per-request access through MPP | Minimum query price not established by the reviewed page |

At Testril's observed rates, one cached 100-block read costs **$0.00012 (0.012¢)**. Fifty cost **$0.006 (0.6¢)**. Section 8 includes preparation costs and a comparison with one-cent and five-cent request prices.

These figures demonstrate a difference in purchase size. A claim about total savings requires equivalent tasks: the same data, scope, freshness, batching, pagination, and output. x402 itself does not impose a one-cent minimum. The cited sources also do not establish that competitors lack provenance or reuse features.

## 3. Current implementation and prerequisites

On 3 October, `dev.testril.ai/mcp` reported version **0.2.2**, payment mode **`cdp`**, and configured data chains **Ethereum, Arbitrum One, and Base Sepolia**. It listed `erc20_balance`, `erc20_transfer_volume`, and `erc721_owner`. See the [captured responses](research/2026-10-03-live-baseline.json).

Only free metadata calls were made. Paid reads, materialization, payouts, and the deployment's payment network remain untested. The code describes binding, materialization, paid reads, and source-block provenance; verify the complete sequence on the deployment used for the demos.

Function creation is not implemented. Adding a function ourselves, selecting one from the catalog, or changing its parameters does not demonstrate creation on request. Older JSON-authoring documentation and newer plans for static Rust functions must be checked against the deployed implementation.

Several proposed functions depend on engine work: additional row types, dependent function calls, stored state, timestamps, and provenance linking outputs to individual inputs. Estimate missing engine features separately from adding a function.

The inspected REST data route does not enforce the same payment checks as MCP. Use paid MCP reads for these demos and for the proposed gateway until that discrepancy is resolved.

Every demonstration must identify whether it uses synthetic data, a recording, live testnet payments, or live mainnet payments. Data-chain configuration does not establish the payment network.

## 4. Demo specifications

**P0–P5** can be demonstrated before function creation. **G1–G3** require it. These identifiers refer to demonstrations, not nine separately built applications. The first release has three source downloads; P1/P3 and the P2 supplier view belong in the treasury application. G1/G2 belong in a later vault application, and G3 combines it with an independent reader.

| Runnable project | Included demonstrations | Result developers see |
| --- | --- | --- |
| `sub-cent-reads` | P0 | Terminal activity table with each charge and remaining budget |
| `treasury-analysis` | P1, P3, supplier side of P2 | Treasury report, source inspection, verification, costs, earnings |
| `paid-reader` | Reader side of P2 | Returned data, a small report, charge, receipt |
| `vault-analysis`, later | G1, G2, supplier side of G3 | Metric definition, generated function and tests, result tables, revision comparison |
| `pool-analysis`, optional | P4 | Swap activity and active-liquidity charts |
| `rest-gateway`, optional | P5 | Authenticated HTTP result, preserved evidence, usage record |

| ID | Demo | Dependencies | Order |
| --- | --- | --- | --- |
| P0 | Sub-cent data reads | Existing transfer volume | First |
| P1 | Treasury outflow analysis | F01 transfer edges; exact balance snapshots | First release |
| P2 | Materialization earnings | P1 data or existing transfer volume; reward accounting | First release |
| P3 | Result verification | P1; independent reference data | Part of P1 |
| P4 | Pool activity and liquidity | F02 swaps; F03 pool state | After evidence of DeFi customer interest |
| P5 | REST access and card billing | Existing data; payment and billing gateway | After evidence that wallet setup prevents adoption |
| G1 | Generate a deposit classification function | F04/F05 vault data; generated G01; generation system | First generation demo |
| G2 | Generate a repeat-deposit function | F05; generated G02; state and timestamps | After G1 |
| G3 | Generate a function and earn from reused data | G1 and P2 | After both work |

### P0. Sub-cent data reads

**Task.** Locate token activity exceeding a supplied transfer-count threshold within prepared historical data. Read short block ranges, choose the next range from the previous result, and stop when the question is answered or the allowance is exhausted.

**Demonstration, 60–90 seconds.** Set a one-cent read allowance. Show who prepared the data and what preparation cost. Run the checks and display each range, result, charge, and remaining allowance. Show why each next request was chosen. End with the result and total cost, then attempt an over-budget request and show that the client refuses to sign it.

**Implementation.** Use existing transfer volume, a small deterministic rule for choosing ranges, a payment helper, and a timeline. Make this a small CLI. Its terminal table lists range, transfer count, read charge, and remaining allowance; the final line identifies the qualifying range or gives a scoped negative result. It writes the run data and receipts to disk. The example should run without an LLM; optional narration can be added. It needs no new backend function.

At current rates, fifty 100-block reads cost $0.006. This is a calculation to validate during testing, not a target call count. Use only requests the task needs. If the complete required range is known, compare a bulk read; small requests are useful when later scope depends on earlier answers or the client can stop early.

**Output and acceptance.** Export the checked ranges, results, receipts, and source references. A new developer can reproduce the sequence unaided. Every paid read stays within the budget. Missing coverage must not appear as zero activity. A negative result applies only to checked ranges. Token-wide transfer volume cannot identify a treasury's counterparties.

### P1. Treasury outflow analysis

**Task.** Explain a treasury's token balance change over a finalized block range. Use one ordinary ERC-20, one chain, one range, and an optional set of team-owned addresses.

**Demonstration, three minutes.**

1. Enter the treasury, token, range, and spending limit. Approve separate charges for preparation and reads.
2. Show incoming amounts, outgoing amounts, net movement, and ranked counterparties in a flow diagram.
3. Add the supplied team addresses and separate internal transfers from external movement.
4. Open a number to inspect its raw inputs, source blocks, and calculation. Keep any unexplained remainder visible.
5. Export the result and runnable client. Show the total charged.

**Visible result.** The browser report contains opening/closing balances, incoming/outgoing totals, net change, a transfer diagram, ranked counterparties, preparation/read costs, and source details. The synthetic example shows outgoing 100 to B, incoming 30 from B, and incoming 20 from C. Self-transfers cancel. The same report includes verification and supplier earnings views. “Export this run” downloads the report and recorded evidence; “Download source” obtains the application and CLI/verifier from a versioned release.

**Implementation.** Add F01 `erc20_transfer_edges`. Read two exact balance snapshots. Calculate sums and classifications with ordinary client code; an LLM may select calls or describe the result but must not perform the accounting or invent wallet labels.

For `[a,b)`, compare end-of-block balances at `a−1` and `b−1` with incoming minus outgoing Transfer amounts. Both snapshots need coverage. Self-transfers cancel. Rebasing, fee-on-transfer, and other nonstandard tokens need separate handling; choose an ordinary token for the first example. Keep raw amounts as integers and apply token decimals only for display.

**Output and acceptance.** Export inputs, calculations, receipts, and source references. An independent calculation must reproduce the totals and exclusions. Address labels need a named source or customer input. This demo does not infer intent, compute tax P&L, or convert all token movements to historical dollar values.

### P2. Materialization earnings

**Task.** Show what happens when another customer pays to read data that the first customer funded. Reuse requires the same bound function and covered range.

**Demonstration, two minutes.** Show the supplier's preparation purchase beside a separate reader application. The reader buys a read and exports a report or runs a useful check. Display the supplier's earnings before and after, the reader's charge, and the coverage expiry. Retrying the same paid request must not create another earning event.

**Visible result.** Run `paid-reader` as a separate CLI beside the treasury application. The reader prints the returned rows or report, actual charge, and receipt. The supplier application refreshes its actual Testril earnings. The reader accepts the bound-function identity and covered range, or a public dataset reference exported by the supplier. It works without the treasury web server or sibling code.

**Implementation.** Use separate payer and reader accounts. Reuse the claim and accounting interface from `testril-claim` where appropriate, after verifying its fields against the deployment. Use a dedicated test deployment or purchase-level records to distinguish the demo's earnings from unrelated traffic.

A 1,000-block read currently allocates about $0.0005 to a sole eligible materializer. Twenty separately paid reads reach the $0.01 claim threshold, subject to eligibility and rounding. Show accrual directly, or disclose a previously accumulated balance when demonstrating a claim. A payout requires a funded rewards wallet and a verified transaction. Identify testnet payments and operator-funded traffic.

**Acceptance.** Costs, eligible coverage, earnings changes, and payout receipts reconcile. Reading the prepared interval causes no new materialization. The demo establishes the earning mechanism; profitable demand still requires independent customers. Materialization rights do not confer copyright over public chain data.

### P3. Result verification

**Task.** Reproduce the treasury calculation from its recorded sources. Implement this as an export and verification mode in P1.

**Demonstration, 90 seconds.** Open a result, inspect the source blocks and calculation, fetch the reference logs and state, and recompute it. Alter a displayed amount and show the failed comparison. Change a source hash and show the separate source check failing.

**Visible result.** The treasury report displays separate source and arithmetic check statuses, with an explanation of failures. A verifier CLI included in its source download accepts a run export and checks it without the web application running. Preserve the exact calculation version needed to reproduce it.

**Implementation.** Export chain and contract, block range, function version or definition hash, parameters, returned values, provenance responses, client calculation version, receipts, and verification instructions. Preserve the inputs to every derived result. Hash the output and calculation manifest separately from Testril's source-block digest.

The existing digest identifies a set of source blocks; it does not prove the arithmetic. A hash detects a change only relative to a trusted reference. Independent recomputation still depends on the reference RPC. The current provenance expansion limit is 10,000 contributing blocks; larger checks need supported partitioning.

**Acceptance.** Unchanged inputs reproduce the answer; altered values or source hashes fail their respective checks. Report which checks passed. Do not describe this as a zero-knowledge proof or a check of unqueried chain history.

### P4. Pool activity and liquidity

**Task.** Compare swap activity and active liquidity for one known Uniswap v3 pool over a short historical interval.

**Demonstration, two minutes.** Plot swaps and liquidity snapshots, inspect blocks where they differ, and export a rule for monitoring finalized data.

**Implementation.** Add F02 `uniswap_v3_swaps` and F03 `uniswap_v3_liquidity_state`, with exact token metadata. Active liquidity is not total deposited value. Explaining liquidity-provider withdrawals requires an additional mint/burn event function; the first two functions alone cannot establish the cause of a change.

**Acceptance.** Swap records match reference events; snapshots match contract calls at the recorded blocks. Display the delay caused by finality. This example analyzes historical or finalized data and does not predict exploits or observe the mempool.

### P5. REST access and card billing

**Task.** Let a customer use the treasury result through a normal HTTP endpoint without managing wallet code.

**Demonstration, two minutes.** Select the dataset and spending cap, obtain an API key, run a short `curl` example, and inspect the result and usage record. Compare data and provenance with direct Testril access.

**Implementation.** Add per-customer credentials, a server-side payer, paid MCP calls, usage records, idempotency, a spending cap, and an endpoint bound to an existing function. Label any test card checkout or synthetic gateway responses. Section 7 describes billing and earnings ownership.

**Acceptance.** Both access methods return equivalent data and provenance for the same scope. Retried requests are billed once. Requests exceeding the allowance are rejected before payment.

### G1. Generate a deposit classification function

**Task.** A vault team wants to group deposits by the owner's USDC balance at the end of the preceding block, excluding supplied operational addresses. The catalog does not contain that computation. This classifies addresses by a defined token balance; it does not infer people's wealth or identity.

**Demonstration, four minutes.**

1. Show the missing function. Agree owner versus sender, balance block, group boundaries, exclusions, and output units.
2. Approve a creation budget. Generate and register a new executable function.
3. Test a known example, threshold equality, excluded owner, and same-block balance change. Show an unsupported request being refused.
4. Quote preparation and reading separately, run a short interval, and inspect the result and input references.
5. Use a second client to discover and call the same function without regenerating it.

**Visible result.** A separate vault application shows the confirmed definition beside generated code or executable definition, tests, quotes, and a deposit-group table. Rows identify balance group, deposit count, deposited assets, and shares for the selected interval. Source details identify the deposits and historical balances used. Export the generated definition with its identity, schema, version, tests, and runtime requirements. The source download includes the application and a small independent consumer of a registered function.

**Implementation.** F04/F05 provide vault data and reference cases. G01 is created during the demonstration. The runtime must support the required historical calls and preserve input references. If it cannot express the rule, choose a supported new computation.

**Acceptance.** New code or a new executable definition persists under a versioned identity. Inputs and outputs have explicit types; execution is deterministic and resource-limited; tests pass before paid work. The result can be reproduced and reused. Existing `llm_tokens` pricing does not establish the future creation price.

Disclose any supported prompt restrictions and human code review. Show actual elapsed time, including labeled cuts in a recording. An off-server script or a parameter change to an existing function does not satisfy this demo.

### G2. Generate a repeat-deposit function

**Task.** Determine whether a campaign's depositors return. Define a repeat deposit as one on a later UTC day within seven days, exclude supplied operational addresses, and report withdrawals through a specified cutoff. Agree whether “first deposit” means first ever or first during the campaign.

**Demonstration, three minutes.** Generate the rule, show the result, change a meaningful part of its definition, generate a new version, and compare both results and their inputs. Mark owners with less than seven days of observation as incomplete rather than failed retention.

**Visible result.** Add a second task to the vault application. Show one row per defined group with observed deposits, withdrawals, repeat-deposit counts, and incomplete observation status. Compare two definitions and their results side by side, with explicit versions and cutoffs. G3 uses this application with another payer; it does not require another application.

**Implementation.** G02 needs stored owner state, sufficient initial history, block timestamps, deposit/withdraw inputs, and provenance for derived results. Share transfers and delegated transactions require explicit accounting rules. This version measures repeat deposits and observed cash flows, not retained capital or unique people.

**Acceptance.** An independent calculation matches both versions. Observation cutoffs and exclusions are correct, and prior versions remain reproducible. This is a generation demo because it creates a previously unavailable computation during the session; prebuilding the rule would only demonstrate analysis.

### G3. Generate a function and earn from reused data

Combine G1 and P2 after both work. Record a five-minute demonstration: request a missing computation, generate and test it, fund preparation, read it from a second application, inspect the materialization holder's earnings, and verify the result.

The earning right currently attaches to materialization. Royalties for function authors, generated-code licensing, and code ownership require separate decisions. Invite interested teams to supply an actual missing metric for a follow-up integration.

## 5. Backend and client work

The first backend request is **F01 transfer edges**, plus confirmation of exact balance snapshots. Existing transfer volume supports P0 and an initial P2 while F01 is built. It has no sender/recipient fields and cannot substitute for F01.

| Backend work | Required by | Client work |
| --- | --- | --- |
| Verify existing balance and transfer volume | P0, P2 | Payment handling, range selection, formatting |
| F01 transfer edges | P1, P3 | Wallet filtering, sums, rankings, diagram, verification and export |
| F02 swaps and F03 liquidity state | P4 | Compare one pool's activity and state |
| F04 vault state and F05 deposit/withdraw events | G1, G2 | Definition inputs and report |
| Function generation and G01 | G1 | Confirm definition, display tests and results |
| Stateful generation, timestamps, and G02 | G2 | Compare versions and observation periods |

Publish client calculations and identify them as client work. Large datasets may require stored aggregate functions. None of these demos assumes external price feeds, native-asset traces, Solana support, identity labels, arbitrary cross-chain joins, or historical P&L. Those require additional sources and functions.

The [function requirements](function-briefs.md) specify schemas, source calls, test cases, and engine dependencies. Use the core repository's review process; estimate missing engine features separately and agree priorities with their owners.

## 6. Wallet setup and payment handling

The wallet lets an application authorize many small purchases within a budget and receive eligible earnings. Demonstrate those operations before requiring visitors to configure a wallet.

| Option | User experience | Payer and ownership |
| --- | --- | --- |
| Recording | See the result immediately | No live payments implied |
| Sponsor-funded trial | Run a fixed example within an allowance | Sponsor pays and holds resulting materialization rights |
| User-funded wallet | Choose the payment network and approve a budget | User pays and holds eligible rights; deposits need separate approval |

A sponsored visitor does not automatically receive the sponsor's materialization rights. Offer wallet setup when the visitor chooses to fund work or receive earnings.

### Client requirements

- Enforce per-operation, session, and total spending limits outside the LLM. Reserve funds for concurrent requests before signing.
- Keep keys in a wallet or signer process. Do not ask public users to paste private keys. Reuse narrow, tested signing code from the existing demo site where useful.
- Use the network, asset, and receiver from the server's quote. Data chain and payment chain are separate.
- Support the advertised batch-settlement scheme: escrow plus cumulative off-chain vouchers. A generic x402 `exact` implementation is insufficient. See the [scheme specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md).
- Serialize voucher updates per channel and resolve uncertain payment outcomes before retrying. A request's authorized charge must not become the entire deposit.
- Display deposits, charges, unused escrow, and payouts separately. A voucher is not a new onchain transfer for each read.
- Implement `payment_required → pay_quote → verb(payment_id)`. MCP tool responses do not necessarily follow an HTTP middleware retry pattern.
- Refresh expired quotes and recheck budgets. Current quotes expire after 120 seconds.
- Explain withdrawal initiation, delay, and finalization. There is no current MCP withdrawal tool; do not promise instant withdrawal or use of this escrow with unrelated providers.

Keep the first client small. Extract shared code only when another demo needs the same behavior.

## 7. Card billing and REST gateway

Build a gateway for customers who want API keys and card billing. It should purchase through the same paid Testril interface and preserve the data's meaning and provenance. This work does not depend on function generation.

```text
Customer application → API key → Gateway → paid MCP / x402 → Testril
                                   │
                            per-customer usage
                                   │
                       card credit or subscription
```

Keep sub-cent precision in usage records and combine charges at billing time. Do not introduce a one-cent minimum per underlying read. A disclosed service fee or subscription can cover gateway costs.

### First version

Expose one existing bound function with explicit limits. A cached read returns data and a provenance reference. Preparation runs as a separately quoted asynchronous job with status, cancellation rules, and a spending limit. Endpoint names and versions remain implementation decisions.

Start with prepaid credit or a paid allowance. Offer recurring plans after measuring use. Overage must be optional and capped. Include card processing, hosting, support, RPC, LLM, settlement, refunds, abuse, and working-capital costs when setting prices.

### Who receives materialization earnings

For the first version, the gateway funds materialization and holds the right to earnings. If customers receive a rebate, record it explicitly as service credit. Maintain records linking customer charges, upstream purchases, earnings, credits, and payouts.

A later version could use dedicated customer-controlled or delegated wallets. That adds custody and authorization work. Do not promise direct ownership or USDC payouts before implementing it.

Only qualifying paid Testril reads create rewards. Ten gateway cache hits following one upstream purchase are not ten earning events. Decide how cached responses are sold and describe that behavior in billing documentation.

### Required checks

Test credential isolation, idempotency, concurrent spending limits, rate limits, usage records, retry reconciliation, preserved provenance, and actual upstream payment. The browser must not choose an arbitrary payer, receiver, or upstream endpoint. Use paid MCP rather than the currently uncharged REST route.

Trial the gateway with a few developers who otherwise reject wallet setup. Measure time to first request, failed setup, repeated use, support cost, and margin. Move it to a separate repository when it needs its own operational ownership and releases.

## 8. Costs and earnings

Published rates observed on 3 October:

```text
materialization = blocks missing coverage × $0.00012
extra retention = blocks missing coverage × extra days × $0.000001
read of an explicit range = $0.00002 + requested blocks × $0.000001
```

The formulas apply to one bound function and exclude any creation charge. Multiple functions and reads add charges. Planned pricing changes may alter these figures; use actual quotes for each run. “Cold” below means data needs preparation; “cached” means coverage already exists.

| Range | New materialization, 24h included | One cached read |
| --- | ---: | ---: |
| 100 blocks | $0.012 | $0.00012 |
| 1,000 blocks | $0.12 | $0.00102 |
| 7,200 blocks, reported Ethereum day estimate | $0.864 | $0.00722 |
| 321,190 blocks, reported Arbitrum day estimate | $38.5428 | $0.32121 |

A small cached request and a full day of new preparation have very different costs. Show the actual scope and payer. Use verified block timestamps for dated examples; `blocks_per_day` is only an estimate.

### Comparing request prices

| Request sequence | Testril cached reads | At $0.01 per request | At $0.05 per request |
| --- | ---: | ---: | ---: |
| One 100-block read | $0.00012 | $0.01 | $0.05 |
| Fifty 100-block reads | $0.006 | $0.50 | $2.50 |

The last two columns are arithmetic examples, not executed competitor benchmarks. Preparing 5,000 distinct blocks from cold costs $0.60 before retention or external costs. One contiguous 5,000-block cached read costs $0.00502, less than fifty small reads. Use separate reads when earlier results determine later requests or allow the client to stop early.

Display enough decimal places: $0.00012 must not appear as “$0.00” or “free.” Read prices, recommended escrow deposits, and the $0.01 reward-claim threshold are separate amounts.

### Materialization earnings

For a 1,000-block read with one eligible materializer, the current 50% share of the variable read fee yields $0.0005. It takes **240** such reads to offset $0.12 in preparation, before other costs and only while eligible. The base fee earns no reward; partial coverage changes the allocation; a latest-block read without a stated range has no variable-fee reward.

Use 100–1,000 block ranges during development. Purchase enough extra retention to keep test data available. Inspect coverage before attempting to demonstrate new materialization: already-funded data cannot be presented as a new supplier purchase.

### Proposed test budgets

- P0: $0.01 for cached reads; preparation and escrow funding shown separately.
- P1: one 1,000-block F01 range, two one-block balance snapshots, and a $0.50 data-work cap. Track reference-RPC and LLM costs separately.
- P2: twenty 1,000-block reads cost $0.0204 and allocate about $0.01 to the sole eligible holder. Buying one's own traffic costs more than it earns and does not establish demand.
- P4/G1/G2: quote the actual function dependencies before publishing prices. Generation needs its own spending cap.

No transactions were executed for this plan. These are proposed implementation budgets, not approval to spend funds.

## 9. Interface, testing, and publication

### Interface and recordings

Show the question, result, and cost first. Put source references, raw responses, and signatures in expandable details. Use Testril's existing olive, cream, and muted-gold colors. Keep each interface focused on its task.

For each main demo, publish a short result clip, a one-minute overview, a complete walkthrough, runnable code, and reproducible output. Include the purchase sequence and failure handling in the developer documentation. Label cuts in recordings and report actual elapsed time.

Publish P0 first, then P1 with P3's verifier, then P2's earnings example. Link recordings to the corresponding code and results. Invite developers to bring one real question for a follow-up session with an agreed definition, budget, and verifiable output. This is proposed publication and outreach work; no outreach has been performed.

### Data and verification

Choose a short public Ethereum example with archive-RPC access. Maintain a synthetic fixture with known expected values and a separate historical example. Record chain, contracts, decimals, block ranges, UTC times, function versions, reference results, payment network, payment mode, coverage expiry, and cold/cached costs in each fixture manifest.

Measure response size as well as block count. For the first treasury example, target at most 5,000 transfer-edge rows and reduce them before LLM narration. Narrow the range if needed. Larger cases may need a filtered or aggregate function.

Test cached reads, cold preparation, peer failure, missing coverage, expired quotes, budget refusal, and uncertain payment retries. Do not replace failed live results with fixtures without a visible mode change. Record dates on fallback recordings and as-of times on finalized data.

Measure preparation and read latency, quote/payment stages, total task cost, external RPC cost, LLM use, and time to first result. Report ranges and medians from repeated runs. Initial targets: a cached treasury result within 30 seconds, a new developer's first paid result within ten minutes, and clear refusal before signing an over-budget request. These are targets, not measured performance.

### Repository organization and source releases

Use `demos/sub-cent-reads/`, `demos/treasury-analysis/`, and `demos/paid-reader/` for the first release. Later projects get their own directories. Each contains its own source, fixtures, tests, assets, configuration, pinned dependencies, and README. A developer must be able to extract a source archive into an empty directory and run it without root tooling, sibling packages, or the hosted demonstration service.

Publish a versioned archive for each project and identify its source revision. The index explains what each example produces and what the developer can change first. Include sample mode so developers can see the intended output before funding a wallet. Keep live payment setup and required source-RPC access explicit. Public distribution requires an explicit license and a release/history review for secrets.

### Per-run exports

Keep “Download source” separate from “Export this run.” A source release contains the maintained runnable project. A run export contains the selected inputs, exact returned data, calculated report, function identity, receipts, provenance, calculation version, and verification outcomes. It contains no credentials. The matching source release supplies the verifier; the export explains reference-RPC requirements and trust assumptions. Export raw integers without losing precision. See the [download specifications](demo-deliverables.md) for the proposed files.

An exported public dataset reference lets the independent reader identify a bound function and covered range. It is not a permission token, wallet credential, or source archive.

Split repositories when demos need incompatible setup, independent releases, or separate service ownership. Avoid a shared framework readers must learn before understanding an example.

## 10. Work estimates and decisions

These preliminary estimates are **engineer-days**, not elapsed calendar time. They exclude backend platform changes, deployment approvals, and customer scheduling. One engineer can build the first set sequentially, with backend review as needed. The archive/export work increases the earlier estimate because independent downloads require their own configuration, sample data, documentation, and release checks.

| Phase | Work and responsible role | Estimate | Completion criteria |
| --- | --- | --- | --- |
| 0 | Fixture, reference calculation, payment client, P0 / demo engineer and backend owner | 2–4 days | Verified paid reads, correct reference result, costs and receipts displayed |
| 1 | F01 and exact balances / backend engineer | 1–3 days if the engine supports the output | Function tests pass; any engine work separately estimated |
| 1 | P1 and P3 / demo engineer | 4–7 days | Reconciled treasury result, export, verifier, runnable client |
| 2 | P2 / demo engineer and backend owner | 2–4 days | Separate buyer, correct earnings, verified accrual or payout |
| 2 | Independent source archives, run exports, documentation, recordings, user trials / demo engineer and marketing owner | 3–5 days | Extracted archives run without siblings; exports reproduce; recordings and five observed trials |
| 3a | P4 / function and demo engineers | Estimate after engine requirements are checked | Reference agreement and a customer use case |
| 3b | P5 / service engineer | 7–12 days for a narrow prototype | Capped REST access; billing and retry checks; card mode identified |
| 4 | G1, G2, G3 / generation owner and demo engineer | Estimate when generation requirements are defined | New persistent functions, meaningful tests, reproducible inputs, independent reuse |

Start with phases 0–2: **12–23 engineer-days**, including F01 if the engine already supports its output. If F01 is blocked, release P0 and an earnings demo using existing transfer volume. The treasury demo still requires F01. Choose P4 or P5 after user trials.

### User trials

Recruit five application developers and three protocol or data operators. Ask them to bring a real task. Observe each developer extract a source archive into an empty directory, run the sample, configure live access, verify a run export, and make the suggested modification. They should not need the hosted UI or other examples' source trees.

Record successful first reads, repeated use, new tasks, integration requests, support time, and failures during wallet setup. Ask what cheaper small reads would let them build. Track actual payers and sponsors; repeated operator-funded reads do not establish customer demand.

A proposed reason to continue is that three of five developers run an extracted example and modify it unaided, two return within a week with another task, and one asks to integrate. These small samples guide revisions; they do not measure market size. If the task is unhelpful, change it. If wallet setup is the main obstacle, prioritize P5. If missing functions are the obstacle, prioritize those functions and generation.

### Decisions needed

1. Choose the first treasury case and users, or prioritize P4 if a DeFi customer supplies a more useful case.
2. Assign F01 and exact-balance verification; confirm whether the current engine supports them.
3. Select the reference RPC, payment network, testnet/mainnet mode, and test budget.
4. Decide sponsored-trial limits and who receives gateway earnings or credits.
5. Agree the tests that must pass before showing function creation.

The next implementation step is phase 0: select the data, reproduce its expected result, and make a verified paid read. Then implement the agreed F01 requirements.
