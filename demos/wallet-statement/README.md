# Follow the Money: Nansen and Testril

A side-by-side USDC statement for one Ethereum address and two fixed historical hours. Recorded runs show real requests and payment evidence. Visitors can connect an Ethereum browser wallet and pay Base mainnet USDC to repeat the comparison.

The provenance section reconstructs the answer in the browser, checks an intentionally edited copy, and can read fresh Ethereum records directly. A downloadable verifier runs against a reader's own node. The dated counterparty-summary discrepancy is explained separately; live statements use Nansen's transaction-history endpoint, which matched Testril in both tested hours.

## Run

Requires Node.js 22.13+ and npm on macOS or Linux:

```bash
cd demos/wallet-statement
npm ci
npm start
```

Open `http://127.0.0.1:4178`. Paul starts and stops this process; use Ctrl+C to stop it. After extracting the source download, run the same commands from the extracted `wallet-statement` directory, omitting the first `cd`.

Optional configuration: copy `.env.example` to `.env`. Defaults use production `https://api.testril.si/mcp` and `https://api.nansen.ai`. No provider account, API key or server signing key is required. Browser wallets must support injected Ethereum providers and typed-data signing; WalletConnect and contract-wallet signatures are not implemented.

The connected wallet is the payer. It does not change the report address: Ethereum pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`, Ethereum USDC, 10 November 2026, 12:00–13:00 or 13:00–14:00 UTC. End times are excluded. Fixed scope keeps comparisons reproducible and prevents arbitrary queries through the demo.

## Run modes and measurements

- **Recorded:** a measured production run for 12:00–13:00, with automated wallet approvals; a verified case study for 13:00–14:00 without invented full-run timings. Playback does not call the providers or authorize payments.
- **Your wallet:** live Testril binding, coverage, preparation when needed, transfers and provenance; then every Nansen transaction page. Each quoted request requires approval. The run stops on an uncertain payment and never automatically submits it again.

Query times include quote negotiation and complete data retrieval. Wallet approval/signing, Testril preparation and provenance are measured separately. Total elapsed time is also retained. Automated approval timing is not representative of human wallet interaction. Preparation may reuse someone else's materialized coverage; known original preparation for these reports is disclosed separately. Receipt confirmations are provider assertions; a linked deposit transaction is not a second service fee or proof that every voucher has already been claimed on-chain.

Each run is limited to **0.25 USDC in service charges** and **0.02 USDC in new escrow deposits**, counted separately. These are per-run limits, not lifetime wallet limits. The browser and gateway both check allowances before submission. Existing compatible channels are reused. Unspent deposits remain in the channel until withdrawn; this demo has no withdrawal controls. Account/network fees are not included in quoted service totals.

The gateway has no spending keys. Signatures are forwarded only for the approved fixed operation and never persisted or exported. Before forwarding one, the gateway durably saves a payment intent and reserves the run allowance. Browser state also saves the intent first. Known confirmations survive later formatting failures. Interrupted or unreadable state cannot establish that nothing was spent.

## Provenance

**Rebuild from saved evidence** independently decodes the archived Ethereum responses and checks all displayed transfer and counterparty totals. **Check live Ethereum records** fetches records from `rpc.mevblocker.io` directly in the browser; it requires no wallet or chain switch. The CSP permits that external service. Its availability and historical RPC limits are outside the demo's control; failed checks are never shown as verification passes.

The checker verifies block references, source digests, linked headers, finalization, hour boundaries, exact amounts and all relevant Transfer events across the complete requested block window, including uncited blocks. It preserves repeated events and handles self-transfers once. JavaScript `BigInt` and lossless parsing of Nansen's original decimal text avoid floating-point rounding.

**Try an edited amount** adds one raw USDC unit to a copy of a transfer and checks that the verifier rejects it. It does not alter the real results or attribute an invented error to either provider.

Saved replay establishes consistency with archived source responses. Live verification trusts the external node to supply correct canonical headers and complete logs; it does not validate Ethereum consensus or receipt-membership proofs. The source trail was retrieved separately from the original data, not as a vendor-signed attestation. Other computations require their own verification logic.

The independent verifier download needs only Node.js:

```bash
# From the extracted verifier directory:
ETHEREUM_RPC_URL=https://rpc.mevblocker.io node verify.mjs input.json result.json
```

The same checker is included in this source directory:

```bash
ETHEREUM_RPC_URL=https://rpc.mevblocker.io \
  node verification/verify.mjs verification/input.json result.json
```

Choose a new output filename for each run. Point the environment variable at your own node to choose your source of trust. This command only reads Ethereum; it contains no signing key or payment code.

## Exports and interrupted runs

**Download this run** contains scope, complete normalized provider rows, timing, public payment receipts, provenance and any completed verification. Partial runs export as attempts. Signatures, private keys and temporary challenges are excluded. **Source download** contains this entire independently runnable demo, lockfile, tests and verification materials; runtime state and local environment files are excluded.

The local gateway stores run metadata in ignored `runtime/` files with atomic replacement. Use one local server process for that directory. Each run's operations are serialized. A repeated paid request ID is refused. Do not delete a journal to retry a purchase.

The browser keeps its most recent live run in local storage. After interruption, **Check saved payment status** can recover a known confirmation without signing or paying. It does not repeat the data request. If the outcome remains uncertain, retain the export and inspect wallet/provider evidence; a new run remains disabled. A fresh purchase after a known completed request is an explicit new run, not automatic recovery. Keep the original export. The demo does not implement unattended settlement reconciliation for unresolved provider outcomes.

## Tests

From this directory:

```bash
npm run preflight # Optional unpaid production discovery; no signatures or paid smoke
npm test
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser
```

Tests use HTTP/MCP peers, cryptographically verified test signatures and a public unfunded test identity. They make no paid requests. Test-owned servers stop when checks finish. Browser tests click Connect and Run, approve the actual payment dialogs, finish all pages, replay provenance, detect an edited amount, exercise cancellation and export the evidence. Desktop/mobile screenshots are written to the repository's `docs/screenshots/` when that directory exists.

For manual verification, load each recorded hour, rebuild its saved evidence, try an edited amount, inspect the source blocks and download a run. Then use a funded Base USDC wallet for an explicitly authorized live run, approve each quote, and inspect all timing and receipt categories. Confirm wallet cancellation stops and reloading retains a pending attempt.

The opt-in `test/live-smoke.mjs` is an operator tool, excluded from normal tests. It requires `ALLOW_PAID_SMOKE=1` and a locally supplied payer key, caps service quotes at 0.10 USDC and new deposits at 0.01, signs in the Node process and exercises the actual browser flow. It records a safe attempt on failure and must not be automatically repeated. Never fund the deterministic identity in `test/peers.mjs`.

## Failure and hosting contract

`src/errors.mjs` exports `describeFailure(error)`. It recognizes only errors deliberately constructed by this module; forged objects and hostile property getters remain unknown. Wording is not an integration API. Descriptors contain exactly `{code, details}`.

| Code                        | Meaning                                                      | Details                  |
| --------------------------- | ------------------------------------------------------------ | ------------------------ |
| `INVALID_REQUEST`           | Request does not identify an allowed fixed operation         | `{}`                     |
| `PROVIDER_UNAVAILABLE`      | Provider transport failed                                    | `{provider, operation}`  |
| `TESTRIL_BINDING_REJECTED`  | Explicit binding refusal                                     | `{functionSlug, reason}` |
| `PROVIDER_REFUSED`          | Provider explicitly refused an operation                     | `{provider, operation}`  |
| `PROVIDER_INVALID_RESPONSE` | Reply or payment offer cannot be safely consumed             | `{provider, operation}`  |
| `PAYMENT_UNCERTAIN`         | Submitted authorization lacks matching confirmation          | `{provider, operation}`  |
| `RUN_STOPPED`               | Expired, stopped, duplicate or unresolved run cannot proceed | `{}`                     |
| `LIMIT_EXCEEDED`            | Service or deposit allowance would be exceeded               | `{}`                     |
| `STATE_UNAVAILABLE`         | Durable run state cannot be read or written safely           | `{}`                     |

`functionSlug` is exactly `erc20.wallet_transfers`; binding `reason` is `invalid_params`, `function_not_found`, `unsupported_chain` or `unknown`. `provider` is `testril` or `nansen`. `operation` is `bind`, `inspect`, `coverage`, `job`, `read`, `materialize`, `provenance` or `transactions`; Nansen uses only `transactions`, and Testril uses the others. No raw provider text, credentials, signatures, stack or arbitrary cause is diagnostic context.

`createApi` in `src/api.mjs` is the web Request/Response integration. The hosting adapter supplies `load(id)`, durable `save(run)`, provider connections and its trusted `onError(error)` mapper. It must serialize access to each run, preserve the saved pre-submission intent, validate descriptors and create its own public references. An uncertain run is never automatically replayed. Storage is hosting-owned; provider execution, domain state and validation remain in this standalone demo. Hosted deployments must follow the repository's public demo/harness failure contract and verify the actual selected demo/adapter pair.

## Code map

`src/gateway.mjs` validates fixed operations and reserves/persists payments. `src/providers.mjs` owns MCP/HTTP details and lossless normalization. `public/runner.js` orchestrates visitor approvals and full pagination. `public/payments.js` signs supported Base USDC terms. `public/verification.js` reconstructs from Ethereum. `public/app.js` presents results; `src/server.mjs` is the standalone local host. No sibling demo or private harness import is needed.
