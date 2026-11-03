# Development and embedding

[Back to setup and the walkthrough](../README.md). Run commands from the
`treasury-analysis` directory. Node.js 22.13+ is required; there is no build step.
The server and CLI use ES modules, and the browser uses plain JavaScript and CSS.

## Code map

| File                                                                                                                 | Responsibility                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`src/server.mjs`](../src/server.mjs)                                                                                | Local HTTP entry point, static file allowlist, session routes, and shutdown. |
| [`src/demo.mjs`](../src/demo.mjs)                                                                                    | Mock transfers, read charges, reset, and exports.                            |
| [`src/mock-chain.mjs`](../src/mock-chain.mjs)                                                                        | Pure mock balance and transfer calculations.                                 |
| [`src/mock-testril.mjs`](../src/mock-testril.mjs)                                                                    | Simulated reads and explicitly fictional evidence.                           |
| [`src/live-config.mjs`](../src/live-config.mjs)                                                                      | Local signer validation, wallet addresses, and payment caps.                 |
| [`src/live-demo.mjs`](../src/live-demo.mjs)                                                                          | Live session operations, recovery, snapshots, and evidence.                  |
| [`src/live-chain.mjs`](../src/live-chain.mjs)                                                                        | RPC transaction signing, submission, and receipt verification.               |
| [`src/live-testril.mjs`](../src/live-testril.mjs)                                                                    | MCP function binding, materialization, paid reads, and caching.              |
| [`src/batch-payment.mjs`](../src/batch-payment.mjs)                                                                  | Quote validation and signing escrow deposits and cumulative vouchers.        |
| [`src/live-journal.mjs`](../src/live-journal.mjs)                                                                    | Local session storage and process lock.                                      |
| [`src/mcp.mjs`](../src/mcp.mjs)                                                                                      | MCP SDK connection and response handling.                                    |
| [`src/transfer-progress.mjs`](../src/transfer-progress.mjs), [`src/transfer-timing.mjs`](../src/transfer-timing.mjs) | Operation progress and measured durations.                                   |
| [`src/archive.mjs`](../src/archive.mjs)                                                                              | Run archives and temporary-file cleanup.                                     |
| [`src/cli.mjs`](../src/cli.mjs), [`src/live-cli.mjs`](../src/live-cli.mjs)                                           | Mock samples, export replay, and deliberate live checks and smoke runs.      |
| [`public/app.js`](../public/app.js)                                                                                  | Browser session, controls, histories, and provenance dialogs.                |
| [`public/transfer-diagram.js`](../public/transfer-diagram.js)                                                        | Transfer diagram and selection.                                              |
| [`public/amounts.js`](../public/amounts.js), [`public/replay.js`](../public/replay.js)                               | Pure amount and replay functions used by browser and Node.js.                |
| [`fixtures/`](../fixtures/)                                                                                          | Mock balances and rates; live chain, token, and example public addresses.    |
| [`test/`](../test/)                                                                                                  | Behavior tests, HTTP MCP peer, and desktop/mobile browser checks.            |

The server connects the mock or live engine to the browser. The live engine owns
the session and connects the chain, Testril, and storage adapters. These adapters
do not import the server or browser controller. Browser modules used by Node.js
are pure functions and do not access the DOM.

The browser explicitly requests Mock or Live and only accepts session state for
that mode. A saved session in the wrong mode or returning HTTP 404 starts fresh;
other failures are shown without retrying or switching modes. Error text is
displayed as supplied by the local server or harness, without message matching.

The CLI's free compatibility check and the live engine share Function binding
and chain-head validation. Binding uses MCP directly and needs no payment state.

## Amounts and session state

Amounts travel through JSON as unsigned decimal integer strings. USDC has six
decimal places; calculations use `BigInt`. Use `parseUsdc` for user-entered
decimal amounts and `rawAmount` for raw values. Convert to display text only at
the interface or CLI boundary.

Mock operations return a new state, so a failed read cannot commit a transfer or
charge. Live transfers cannot be rolled back: the engine saves the signed
transaction before broadcast and recovers that exact transaction after failure.
Live actions run in a queue, and stale transfer/reset revisions are rejected.

Testril read pipelines can run concurrently. Payment settlement is serialized
because vouchers contain cumulative amounts. The engine saves charge and deposit
reservations before settlement. An uncertain settlement blocks later payments.
Successful paid results are cached by operation, function, and block window.
Refresh fixes its block until it succeeds, allowing retries to reuse those results.
All pipelines finish before the engine reports a failure or starts another action.

The local journal writes a temporary file and renames it over `.live-state.json`;
`.live-lock` prevents concurrent live servers. Reset changes the run boundary,
but retains cumulative receipts, spending, and escrow. Saved caps may decrease;
restarting with higher environment limits does not raise them.
See [the live guide](live.md) for operational recovery.

## Checks

```sh
npm ci
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

`npm run format` applies Prettier. ESLint and Prettier configuration are included
in this folder. Unit and HTTP integration tests use Node's test runner. Live
tests use a local HTTP MCP peer and throwaway keys; they make no real transfers
or payments. The Playwright suite starts its own temporary server on port 4175,
checks desktop and mobile, and stops that server when finished. Keep the port
free. Documentation-only and string-only changes do not require tests.

For manual visual review, start the app with `npm start` and follow the mock
walkthrough on desktop and phone. Check balances, both histories, cost breakdowns,
replay, reset, and keyboard provenance selection. Send and Balances share the
left panel on desktop; narrow screens stack the panels. With configured live
wallets, verify the progress modal and failed-refresh behavior described in
[the live guide](live.md). Live smoke commands spend test funds and require
explicitly configured caps.

## Embedding the live engine

Read the [structured failure interface and catalog](errors.md) when embedding
this engine. Import `describeFailure` from `src/errors.mjs`; do not interpret
exception messages, HTTP properties, or arbitrary `cause` chains as domain
classifications. Host authorization rejections retain their original identity.

`createLiveDemo({ config, chain, mcp, directory, authorizePayment, journal })`
returns an engine with `state`, `progress`, `refresh`, `transfer`, `reset`,
`reconcile`, `provenance`, `balanceProvenance`, `export`, and `close` methods.

- `config` comes from `liveConfig(env)` and contains validated signers and caps.
- `chain` comes from `createLiveChain(config)`; `mcp` comes from
  `connectMcp(config.mcpUrl)`.
- `directory` selects local storage when no custom journal is supplied.
- `authorizePayment` optionally receives `{ quoteId, chargeRaw, depositRaw }`
  before settlement. Rejecting its promise stops that payment without recording
  an uncertain settlement. Local runs omit it. It authorizes data payments;
  it does not authorize RPC wallet transfers.
- `journal` optionally supplies async `load()`, `save(contents)`, and `close()`.
  `load` returns saved JSON text or no saved state. `save` receives JSON text
  and must durably save each payment reservation and signed transaction before
  resolving. Failed saves stop further actions until the engine is recreated.
  The host must prevent concurrent engines from writing the same session.

`transfer({ revision, from, to, amount })` takes a decimal USDC string and the
latest state's revision. `reset({ revision })` sweeps all A and B funds back to
Treasury. `refresh()` recovers pending work and refreshes reads. Call `close()`
at shutdown; it waits for queued work and closes MCP and the journal. The engine
owns those resources once passed to it.

`reconcile()` is an explicit, serialized payment recovery operation. It replays
only saved `paying` entries with their original request scope, amount, and payment
identifier. It signs a **zero cumulative voucher**, with no deposit authorization,
to authenticate the payer to Testril's payment-identifier lookup. It never calls
`authorizePayment`, buys new work, or submits an RPC transfer. Unknown, pending,
conflicting, or mismatched replies leave the entry uncertain. A successful lookup
must confirm the payer, network, amount, and original receipt or request scope;
receipt and materialization replies must also match the saved quote ID.

The private journal saves accepted quote terms for new payments, but no payment
signatures. Older entries can use inspected channel terms only when they identify
one receiver unambiguously. Reconciliation saves each confirmation durably without
changing reserved charges or deposits. A failed save blocks further actions until
storage is repaired and the engine is reopened.

An expired receipt confirms settlement without supplying expired results. The
next refresh reads a newer block under normal authorization and caps. Live replay
results remain cached for their original scope. Ordinary refresh never initiates
payment reconciliation; the embedding operator decides when to call it. A host
must keep the sandbox isolated through reconciliation, fresh reads, cleanup,
verification, and successful closure before reusing it.

Keep keys in the host process. Authentication, user sessions, payment approval
policy, and durable hosted storage belong to the embedding application. The
included HTTP server is intended for local use.
