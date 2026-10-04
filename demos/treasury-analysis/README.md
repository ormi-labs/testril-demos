# Treasury analysis

Ask where a treasury’s USDC went. Inspect directed transfers, reconcile balances,
verify the evidence, and download the application as a starting point.

**Version 0.1.0 runs fictional data only.** No wallet, payments, materialization,
or earnings. Live integration awaits `erc20_transfer_edges` and a budgeted x402
client. Free MCP discovery shows the deployed functions.

## Run

Requires Node.js **22.13 or later**, npm, and `tar` on macOS or Linux. No build step
or runtime dependencies.

```sh
cd demos/treasury-analysis  # or the extracted treasury-analysis folder
npm ci
npm start
```

Open **http://127.0.0.1:4173**. Optional configuration: copy `.env.example` to
`.env` to change `PORT` or `TESTRIL_MCP_URL`. The server accepts local connections
only; it is not a hosted deployment configuration.

Expected sample: opening **1,000**, incoming **50**, outgoing **100**, closing
**950 USDC**. The **50 USDC self-transfer cancels**. Including Team B gives
**+20 USDC external team movement**, separately from the treasury’s −50 change.
Try changing the starting block to `103`: no transfers remain.

## CLI and downloads

```sh
node src/cli.mjs sample run.json
node src/cli.mjs verify run.json
node src/cli.mjs discover                 # free, network required
```

**Export this run** contains inputs, exact raw rows, report, illustrative cost
records, provenance, calculation version, and verification status. Extract it
and verify `run/run.json` with the matching source version. The sample verifier
compares separate event/state fixtures; it does not verify Ethereum.

**Download source** contains this standalone project and locked development
tools and a file-digest manifest, excluding local configuration and installed dependencies. Downloads are
for private evaluation; public distribution still needs a repository license.

The verifier also supports externally supplied `mode: "live"` runs in this
format with `ETHEREUM_RPC_URL` set. It retrieves token-wide Transfer logs and
balances at pinned canonical hashes using
[EIP-1898](https://eips.ethereum.org/EIPS/eip-1898). Requires historical state;
trusts the reference provider for complete logs and correct state. It rejects
synthetic runs as on-chain evidence. No live export producer exists yet.

## Development

```sh
npm test                     # accounting, verifier, HTTP peers, extracted source
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser          # desktop + mobile, local server on port 4175
```

`src/` holds accounting, server, CLI, verification, and free MCP discovery.
`public/` holds the plain JavaScript interface; `fixtures/` holds fictional data.
Amounts use integer strings and BigInt. Start by changing a fixture and its
independent reference events, then check the resulting report.

For visual review, inspect desktop and phone layouts, tab through controls,
open evidence, run verification, and extract both downloads. Styling follows
Testril’s approved derivative guide v1.0; asset origins are recorded in
`public/assets/README.md`.
