# Pool Volume: Testril and Allium

Compare hourly Uniswap v3 swap counts and exact raw token volumes from two providers. Recorded runs make no paid requests. Fresh runs use the visitor's browser wallet, with approval for every payment and separate Testril preparation accounting.

This is an initial local implementation. No measured recording is published yet. The optional layout example is explicitly invented and makes no timing or spending claims. Live settlement against both services remains unverified; fresh runs are disabled by default. The existing Cloudflare deployment currently serves Move Money, not this demo.

## Run locally

Requires Node.js 22.13+ and npm on macOS or Linux. From the extracted demo directory, or from this repository:

```bash
cd demos/pool-volume
npm ci
cp .env.example .env
npm start
```

Open `http://127.0.0.1:4176`. Paul starts and stops this process; use Ctrl+C to stop it. The initial view reports that there are no measured recordings. Choose **Explore a layout example** to inspect the comparison without a wallet. Recorded playback never contacts the providers.

The demo is self-contained: its package, assets, source, and tests do not import sibling demos or root tooling. In an extracted source directory, omit the initial `cd` command.

## Payment network to enable

Enable **Base mainnet (`eip155:8453`) with native USDC** on Testril:

```text
Network: eip155:8453
USDC:    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

Allium already advertises this network. The analyzed data is on Ethereum; payment is on Base. These are independent choices. Testril must supply valid mainnet quote fields, the token's actual EIP-712 signing domain, and a working settlement rail. The wallet verifies the quote's token domain against the on-chain USDC `DOMAIN_SEPARATOR()` before signing. Batch payments use the escrow and collector documented in [Testril's payment instructions](https://testril.si/agents/payments/); their Base deployment and settlement must be verified before enabling visitors.

An unpaid Base RPC check on 18 October confirmed that native USDC's domain is **`USD Coin`, version `2`**, not the `USDC` name in Testril's current testnet quotes. The documented escrow and collector both have deployed bytecode on Base. These checks do not establish successful payment settlement; ensure Testril advertises the mainnet domain correctly before commissioning the rail.

No Allium account, API key, hosted-wallet account, private key file, or funded server wallet is used. The initial wallet integration supports an injected Ethereum browser wallet (`window.ethereum`) with typed-data signing. WalletConnect and contract-wallet signatures are not implemented.

## Check readiness without spending

From `demos/pool-volume`:

```bash
npm run preflight
```

This binds report metadata, inspects coverage, requests unpaid quotes, and checks Allium's SQL submission payment challenge. It signs nothing, pays nothing, and starts no materialization job. Output excludes signed payloads and temporary payment identifiers. A successful payment challenge does not establish successful paid SQL execution, result access, or data correctness.

An unpaid live check on **18 October 2026** found:

- The Ethereum hourly pool-volume binding succeeds. An unpaid read with the pool filter reaches the coverage gate; the report has no materialized coverage. A completed filtered read remains unverified.
- Its three-hour preparation quote was **1,661.2092 test USDC for 13,843,410 blocks**, reflecting factory history and dependencies. This is a quote, not a charge or a prediction of future mainnet pricing.
- Testril offered Base Sepolia test USDC; Base mainnet settlement was not enabled in that check.
- Allium's `SELECT 1` submission offered a Base mainnet USDC payment challenge. Paid submission through completed results remains unverified.

The first report therefore needs operator-prepared coverage, existing shared coverage, or a narrower supported scope before it is suitable for visitor-funded reads. **Do not increase the visitor spending cap to buy the initial factory history.** Show operator preparation costs alongside recordings, even when visitors subsequently pay only for reads.

## Enable fresh wallet runs

After enabling and verifying the payment rail, checking accountless Allium results, and preparing suitable report coverage, set these values in `.env` and restart the demo:

```dotenv
LIVE_ENABLED=true
TESTRIL_MCP_URL=https://dev.testril.ai/mcp
ALLIUM_URL=https://agents.allium.so
REPORT_FROM_HOUR=2026-10-17T12
```

`REPORT_FROM_HOUR` must be a complete past UTC hour. The report always covers three hours, one fixed Ethereum pool, and the same token ordering. Visitors cannot submit arbitrary SQL, endpoints, addresses, or date ranges. Connect a browser wallet, choose **Run comparison**, and approve each displayed quote. The wallet can switch to Base when signing. Keep native Base USDC available for purchases; wallet or network fees may also apply.

Limits apply across both providers in one run: **0.25 USDC in quoted service charges and, separately, 0.25 USDC in escrow deposits**. Deposits are not additional query charges. Existing eligible channels are reused, and new deposits use the quoted minimum or the amount needed for the current charge. Unused escrow requires a separate on-chain withdrawal: initiate, wait the advertised delay, then finalize. This demo does not implement withdrawal controls.

No signature is sent before approval. Canceling or closing the dialog stops the run, but does not undo earlier purchases or stop already-paid background work. Failed or uncertain paid requests are never automatically resubmitted. Download the attempt and inspect the provider's run/job or wallet evidence before starting again. Run state is in server memory; refreshing the page or restarting the server does not reconcile previous payments.

These are limits on each run, not on the wallet's lifetime spending. A visitor can explicitly start another run. Before hosting publicly, integrate this demo into the harness and add deployment-level request limits; this server binds only to loopback and does not accept cross-origin browser requests.

## What matches, and what does not

- Data: Ethereum pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`, USDC/WETH, 0.05% fee, over identical whole UTC hours.
- Testril: bind `uniswap_v3.pool_volume` through the canonical factory, inspect coverage, read the selected pool using `key.pool`, and request missing preparation only when necessary. Existing paid jobs are followed before considering more preparation.
- Allium: aggregate `ethereum.dex.trades` for that pool and both token addresses. Use raw amount strings with exact decimal arithmetic, return integer strings, and count trade rows. Submission, status, and results all use the machine-payment HTTP API, not authenticated hosted MCP. The complete SQL is visible in the interface and exported in the source.
- Comparison: fill missing hours with zero, reject duplicate hours or a different scope, and compare raw integers without floating-point conversion. A one-atom mismatch is a mismatch. No USD valuation is compared.

Allium trade-row counts must still be reconciled to canonical Swap events before making equivalence claims. Exact numeric casts fail rather than silently round if data exceeds the warehouse's 38-digit integer capacity. Test fixtures exercise the protocol, not vendor data quality.

Testril preparation includes binding, coverage inspection, materialization, and job waiting. Its factory-scoped dependencies may do broader work than Allium's pool query; that work is disclosed separately rather than described as identical computation. Shared coverage snapshots are retained with fresh-run exports; original payer identity and historical preparation spending may be unknown. The current interface does not infer either.

## Timing and payment evidence

Providers run sequentially to avoid overlapping wallet prompts. Browser timings include request transport, payment negotiation, paid retries, polling waits, and complete result retrieval. Testril preparation and wallet approval/signing waits are separated from read/query time. A provider's total elapsed time includes all of those phases. Individual execution-step times are server request durations, not complete-run durations. Browser measurements are not independently attested.

Payments start as unconfirmed authorization records. A matching successful provider receipt marks them confirmed; absent receipts remain explicitly unconfirmed even if data is returned. The UI labels authorized amounts rather than claiming verified spending when any included payment lacks confirmation. Transaction links are public evidence, not independent verification of settlement. Receipts, not a quoted submission price alone, are needed to assess final spend. Gas, withdrawal costs, and unreported fees are not included in service-charge totals.

## Record, export, and publish

**Download this run** exports one run's public inputs, results, measured times, steps, coverage, and payment evidence as JSON. Incomplete or failed runs export as attempts; they cannot be imported as completed recordings. Payment signatures, private keys, and transient challenges are excluded. A source download instead contains this entire demo directory and its dependencies' lockfile; `npm ci` installs dependencies after extraction.

To publish a completed run, from `demos/pool-volume`:

```bash
npm run recording:import -- /absolute/path/to/pool-volume-run.json ethereum-three-hours
```

Review the created `recordings/ethereum-three-hours.json`, retain any known operator preparation costs in accompanying notes, and commit it. Restart the server to load the recording. The importer validates the fixed report and projects public evidence fields, refusing overwrites. Recordings are supplied by an operator and are not independently audited. No invented fixture is shipped as a measured recording.

## Checks and visual verification

From `demos/pool-volume`:

```bash
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Tests own and stop their temporary servers. Browser checks exercise the actual Run button and payment dialog on desktop and mobile, with Testril MCP and Allium faked at HTTP. Fake peers recover actual test signatures, enforce cumulative vouchers, and verify ERC-3009 deposit recipients. No test spends real funds or calls paid vendor endpoints.

For manual review, open the layout example at desktop and mobile widths. Check that no unmeasured timings or costs appear as benchmark results, exact integers remain readable, and the table scrolls within its container. On a verified live deployment, inspect each quoted charge and escrow commitment, cancel one approval, and confirm the attempt can be downloaded without a signature. Then complete a bounded run, reconcile raw values to events, verify payment evidence, and import the resulting recording. Desktop and mobile screenshots live in the repository's `docs/screenshots/pool-volume-example-*.png`.

## Code map

`src/server.mjs` owns the fixed local routes and bounded run sessions. `src/run.mjs` advances each provider's workflow. `src/providers.mjs` holds MCP/HTTP transport and the SQL. `public/payments.js` handles browser signatures and escrow plans; `public/model.js` holds exact comparison and recording validation. `public/app.js` connects the interface to these operations. `src/preflight.mjs` inspects unpaid readiness; `src/import-recording.mjs` prepares reviewed recordings for playback.

For the supporting research and unresolved Allium documentation discrepancy, see the repository's `docs/research/2026-10-18-allium-accountless-access.md`. This README contains the setup and limitations needed without that document.
