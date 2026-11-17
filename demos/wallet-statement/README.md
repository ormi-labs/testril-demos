# Pool Flows: Testril and Nansen

Hosted at `https://demos.testril.si/pool-flows/`.

Compare the cost and time of retrieving USDC transfers into and out of Uniswap’s USDC/WETH liquidity pool on Ethereum. Every transfer and exact amount is compared, including repeated transfers.

The page has two tabs, **Historical Run** and **Run with your Wallet**, and three sections:

- **Summary:** read cost and read time with equal prominence.
- **Output:** each provider’s transfer count, complete ledgers and a JSON download.
- **Full costs & time:** preparation, reading and provenance. Nansen’s preparation cost/time are unknown; provenance is N/A for its transaction-history endpoint. A small blog reference explains why provenance matters and the original hourly discrepancy.

## Run

Requires Node.js 22.13+ and npm on macOS or Linux:

```bash
cd demos/wallet-statement
npm ci
npm start
```

Open `http://127.0.0.1:4178`. Stop with Ctrl+C. After extracting the source ZIP, run from the extracted `wallet-statement` directory, omitting the first `cd`. Paul starts and stops interactive programs himself.

Optional configuration: copy `.env.example` to `.env`. Defaults use production `https://api.testril.si/mcp`, `https://api.nansen.ai` and the public Ethereum node `https://rpc.mevblocker.io`. `TESTRIL_MCP_URL`, `NANSEN_URL` and `ETHEREUM_RPC_URL` override them. No provider account, API key or server signing key is required. Browser wallets must support injected Ethereum providers and typed-data signing; WalletConnect and contract-wallet signatures are not implemented.

## Historical and wallet runs

**Historical Run** plays the full UTC day of 10 November 2026: **7,139 matching transfers**, including all 69 Nansen transaction-history pages. It was recorded on 17 November using the same local browser client against both production APIs, with automated wallet approval. Read service charges were 0.007193 USDC for Testril and 0.690000 for Nansen; read times were 3.578 and 150.528 seconds respectively. These measure provider retrieval from that client, not Cloudflare gateway latency or a repeated latency study. The sample makes no provider requests or payments. Both original hourly recordings remain in the source archive.

**Run with your Wallet** lets visitors select a completed UTC day. The initial selection is yesterday. The report address remains Ethereum pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`; the token remains Ethereum USDC. The connected wallet pays for data in Base mainnet USDC and does not change the pool address.

Before any purchase, the server resolves both UTC boundaries against finalized Ethereum blocks. It checks the node’s chain ID and the blocks immediately before each boundary. Date strings must identify real completed days from 31 July 2015 onward; not-yet-finalized days cannot run. Visitors cannot supply block numbers, another address or a node URL. The resolved scope is saved with the run and returned to the browser. Changing the date clears displayed results; a pending purchase prevents changing it.

Testril uses `[00:00:00, next day 00:00:00)`. Nansen [documents inclusive date bounds](https://docs.nansen.ai/guides/data-methodology-and-technical-reference), so its request ends at `23:59:59` on the selected date, matching Ethereum’s whole-second timestamps. The demo uses Nansen’s **transaction history**, not the counterparty-summary endpoint involved in the original blog discrepancy. Both historical hourly transaction listings matched Testril.

Each live run binds Testril’s `erc20.wallet_transfers`, checks coverage, purchases any missing preparation, reads transfers and retrieves provenance. It then retrieves every Nansen transaction page. Each purchase requires wallet approval. Provider calls are sequential to avoid overlapping prompts. Unknown settlement stops the run and is never automatically submitted again.

## Costs, timing and limits

Summary metrics compare **reading only**. Query time includes quote negotiation and complete retrieval, excluding wallet approval/signing, preparation and provenance. Full costs & time shows the three phases separately. When data was reused, the preparation row shows its earlier cost/time when known, or Unknown; a note states that no new preparation charge was made and gives current setup/coverage-check time. For fresh preparation, the row includes binding, coverage checks and materialization wait. Nansen’s internal preparation is unknown.

The full-day sample reused prepared Testril data. Its known earlier preparation charges total **0.860760 USDC**, displayed separately; the complete preparation time was not recorded. The new read required a 0.010000 USDC escrow deposit, not an additional service fee.

The historical recording used automated wallet approvals. Its approval timing does not represent a person’s interaction. The independent day lookup is common to both providers, measured separately, and requests no payment. Total elapsed and wallet time remain available under payment evidence. Provider receipts assert confirmations; a deposit transaction is not a second service fee or proof that every voucher has already been claimed on-chain.

Runs are limited to **2 USDC in service charges**, **1 USDC in new escrow deposits**, 100 Nansen pages of at most 100 transactions each, 20,000 normalized transfers and one hour. Charges and deposits are checked separately by both browser and gateway. These are per-run limits, not lifetime wallet limits. A limit stops the run without presenting a truncated report as complete. Existing compatible channels are reused. Unspent escrow stays in the channel until withdrawn; this demo has no withdrawal controls. Network fees are additional.

The gateway has no spending keys. Signatures are forwarded only for the approved operation and never persisted or exported. Both browser and gateway durably record intent before a signature is forwarded. The gateway also reserves the run allowance. Known confirmations survive later response failures. Interrupted or unreadable state cannot establish that nothing was spent.

## Provenance and source download

The interface shows provenance’s cost/time and links to [Why Provenance Matters](https://testril.si/blog/why-provenance-matters/). The interactive verification walkthrough has been removed. Testril’s provenance remains in live run exports; the source includes the independent checker and archived Ethereum evidence used to verify the historical recordings.

**Download source (ZIP)**, at the lower right, contains the independently runnable app, this README, lockfile, tests, saved recordings and verification materials. Local environment files, dependencies and runtime journals are excluded. The saved checker can be run from the source directory:

```bash
ETHEREUM_RPC_URL=https://rpc.mevblocker.io \
  node verification/verify.mjs verification/input.json result.json
```

This command checks the **two original hourly inputs**, not the full-day sample or an automatically selected live day. It only reads Ethereum and contains no signing key or payment code. Use a new output filename and your own node to choose your source of trust. The checker verifies source digests, finalized block references, time boundaries, exact amounts and all relevant Transfer events, including uncited blocks. It trusts the node’s canonical headers and complete logs rather than validating Ethereum consensus. Public inputs and instructions are also available in the [blog’s verification repository](https://github.com/ormi-labs/why-provenance-matters).

The daily recording’s `verification` object links the independently retrieved full-day Ethereum archive and records its SHA-256 digest. Every Testril transfer’s position and exact amount, every cited block hash and the provenance digest were checked against that evidence. Nansen’s complete normalized ledger matches Testril with multiplicity preserved. These checks trust the archived node data; they do not validate Ethereum consensus. The original hourly checker command above does not replay this separate daily verification.

## Exports and interrupted runs

**Download this run** contains the selected scope, complete normalized provider rows, timing, public payment receipts and provenance. Partial runs export as attempts. Signatures, private keys and temporary challenges are excluded.

The local gateway stores metadata in ignored `runtime/` files using atomic replacement. Use one server process for that directory. Each run’s operations are serialized. Repeated paid request IDs are refused. Do not delete journals to retry purchases.

The browser keeps its most recent live run in local storage. **Check saved payment status** can recover a known confirmation without another purchase; it does not repeat the data request. An uncertain outcome keeps new runs disabled. Retain the attempt and inspect wallet/provider evidence. A fresh purchase after a known confirmation is an explicit new run, not automatic recovery. This demo does not implement unattended settlement reconciliation.

## Checks

From this directory:

```bash
npm test
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser
REPORT_DATE=2026-11-09 npm run preflight # Optional unpaid production discovery
```

Tests use HTTP/MCP/RPC peers and a public unfunded test identity, with no real spending. They check different selected days and block ranges, inclusive/exclusive boundaries, invalid dates, unavailable/wrong-network nodes, pagination, exact amounts, limits, cancellation, duplicate requests, protected pending state and exports. A 62-page run verifies the actual HTTP adapters. Browser checks cover both layouts, all ledger rows, tab/date isolation and actual payment dialogs. Test-owned servers stop afterward. Screenshots are written to `docs/screenshots/` when that repository directory exists.

Preflight defaults to yesterday, checks Ethereum boundaries and obtains unsigned provider offers. It does not sign, pay, create a materialization job or submit a transfer. It does not prove paid delivery.

For manual verification, compare both summary metrics, inspect all 7,139 historical transfers in each provider’s ledger, and check the phase table. On the wallet tab, select another day and confirm that historical figures disappear. A funded live run requires explicit spending authorization; approve each quote and inspect the dated export. Reload with a pending attempt to confirm that date changes and new runs remain blocked.

The opt-in `test/live-smoke.mjs` is an operator tool, excluded from normal tests. It requires `ALLOW_PAID_SMOKE=1` and a locally supplied `TESTRIL_PAYER_PRIVATE_KEY`, and signs in the Node process. By default it stops at 0.10 USDC in service quotes, 0.01 in new deposits or 0.11 combined. `PAID_SMOKE_DATE` selects a completed UTC day; `PAID_SMOKE_URL=https://demos.testril.si/pool-flows/` targets production instead of its temporary local server. `PAID_SMOKE_EXPECTED_PAYER` checks the signing address. The three allowance variables `PAID_SMOKE_SERVICE_CAP_ATOMS`, `PAID_SMOKE_DEPOSIT_CAP_ATOMS` and `PAID_SMOKE_COMBINED_CAP_ATOMS` must only be raised with explicit funding authorization; they cannot exceed the demo caps. `PAID_SMOKE_BASE_RPC_URL` optionally selects the Base node. The script saves reserved quotes before approval, retains a safe attempt on failure, closes its temporary server and must not be automatically repeated. Local operator runs also save `provider-http.jsonl` with page, paid/unpaid, HTTP status and quote/receipt-presence flags. It contains no headers, signatures or response bodies; diagnostic write failures cannot discard a provider response. Never fund the deterministic test identity.

`test/total-smoke.mjs` is a separate operator experiment comparing a full-day **total** using Nansen counterparties against a Testril transfer read counted locally. It does not change the browser comparison. It requires the same explicit opt-in and locally supplied key, an exact `PAID_SMOKE_EXPECTED_PAYER`, and `PAID_TOTAL_PRIOR_JOURNAL` naming the earlier full-day gateway status JSON so its reservations remain in the overall budget. It fixes the date to 10 November 2026, permits at most another 0.10 USDC including deposits, and never purchases materialization. Run with `node test/total-smoke.mjs` only after supplying those variables and authorizing the spend. Its temporary directory retains safe receipts, normalized counts and Testril rows; unknown outcomes stop without replay. Quote and paid-response times exclude signing. The summary parser excludes other tokens and rejects malformed or duplicate statistics; a non-final first page stops this one-page experiment rather than publishing a partial total.

## Failure and hosting contract

`src/errors.mjs` exports `describeFailure(error)`. Only this module’s branded failures are recognized; forged objects and hostile getters remain unknown. Wording is not an integration API. Descriptors contain exactly `{code, details}`.

| Code                        | Meaning                                                                                    | Details                  |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| `INVALID_REQUEST`           | Invalid day or unsupported operation/parameters                                            | `{}`                     |
| `SCOPE_UNAVAILABLE`         | Ethereum could not confirm the selected day’s finalized block range; no purchase submitted | `{}`                     |
| `PROVIDER_UNAVAILABLE`      | Provider transport failed                                                                  | `{provider, operation}`  |
| `TESTRIL_BINDING_REJECTED`  | Explicit binding refusal                                                                   | `{functionSlug, reason}` |
| `PROVIDER_REFUSED`          | Provider explicitly refused an operation                                                   | `{provider, operation}`  |
| `PROVIDER_INVALID_RESPONSE` | Reply or payment offer cannot be safely consumed                                           | `{provider, operation}`  |
| `PAYMENT_UNCERTAIN`         | Submitted authorization lacks matching confirmation                                        | `{provider, operation}`  |
| `RUN_STOPPED`               | Expired, stopped, duplicate or unresolved run cannot proceed                               | `{}`                     |
| `LIMIT_EXCEEDED`            | Service or deposit allowance would be exceeded                                             | `{}`                     |
| `STATE_UNAVAILABLE`         | Durable state cannot be read or written safely                                             | `{}`                     |

`functionSlug` is `erc20.wallet_transfers`; binding `reason` is `invalid_params`, `function_not_found`, `unsupported_chain` or `unknown`. `provider` is `testril` or `nansen`. `operation` is `bind`, `inspect`, `coverage`, `job`, `read`, `materialize`, `provenance` or `transactions`; Nansen only uses `transactions`. No raw provider/node text, credentials, signatures, stack or arbitrary cause is safe context.

`createApi` in `src/api.mjs` is the Request/Response integration. New bodies contain `{payer, window}`, with `window` a `YYYY-MM-DD` date. The resolved scope is persisted in `run.report`; clients cannot supply it. Legacy `"day"` and numeric `12`/`13` identify retained historical windows for existing integrations. Older `{payer, hour}` journals remain readable for payment inspection but cannot execute another step. The hosting adapter supplies durable `load(id)`, `save(run)`, provider connections and its trusted error mapper. It serializes access, retains pre-submission intent and creates correlated public references. Hosted releases must verify the actual selected demo/adapter pair under the public demo/harness failure contract.

## Code map

`src/report-scope.mjs` resolves a day’s Ethereum boundaries. `src/gateway.mjs` validates operations and persists/reserves payments. `src/providers.mjs` owns MCP/HTTP and lossless normalization. `public/runner.js` orchestrates approvals and complete pagination. `public/payments.js` signs Base USDC terms. `public/app.js` renders the three sections; `src/server.mjs` is the standalone host. `public/verification.js` is the historical checker used by the CLI and recording tests. No sibling demo or harness import is needed.
