# Move Money

Move USDC between Treasury, Counterparty A, and Counterparty B. Read their
balances with Testril, replay the transfers, and select an arrow to inspect provenance.

With no signing configuration, start in **Mock** mode: Arbitrum, wallets, transfers, reads, prices, and evidence
are simulated. No funds move or payments occur. **Live** mode uses Base Sepolia
test USDC, real testnet transfers, and paid reads at `https://dev.testril.ai/mcp`.

## Run

Requires Node.js **22.13+**, npm, and `tar` on macOS or Linux. No build step or
build step. Runtime dependencies are the MCP SDK and viem, locked by `npm ci`.

```sh
cd demos/treasury-analysis  # or the extracted treasury-analysis folder
npm ci
npm start
```

Open **http://127.0.0.1:4173**. Optional: copy `.env.example` to `.env` to change
`PORT`. Mock mode needs no credentials. The server accepts local connections only.

## Try it

1. Transfer **0.25** from Treasury to A, then **0.10** from A to B.
2. Expect balances **0.75 / 0.15 / 0.10 USDC**.
3. **Transfer History** updates after each transfer, with one row per event, UTC
   times, and block numbers. Use Replay to watch it build. Click an arrow or a
   balance for mock source evidence; close the modal with Escape or Close.
4. **Payment History** shows the newest receipts first, with read costs and block
   numbers. Hover over
   a cost (or focus or tap it) for its breakdown. It stays current even when
   its tab is hidden. Switching tabs, replay, and provenance inspection are free.
5. **Reset demo**, below the header, returns funds to Treasury and clears Transfer
   History and Payment History. It restores the mock payment wallet and resets
   read costs to zero. Reset itself adds no mock read charge.

In mock mode, each transfer refreshes three balance reads and one history read. A separate mock
payment wallet covers their illustrative charges. Refreshing resumes the tab’s
cached session; restarting the server clears sessions. Data preparation is assumed,
so this version has no materialization or supplier earnings. On phones, scroll the
transfer diagram horizontally.

## Live Base Sepolia

Use four dedicated test wallets: Treasury, Counterparty A, Counterparty B, and a
separate Testril payer. Treasury needs at least 1 test USDC; each wallet that sends
transfers needs Base Sepolia ETH for gas. The payer needs test USDC for escrow.
Use Circle USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, chain ID **84532**.

Copy `.env.example` to `.env` and set the four private keys locally. Public
addresses default to `fixtures/live.json`; override them with the address variables
shown in `.env.example` when using your own wallets. A signer must match its address.
Keep keys out of chat, browser code, and source control.

```sh
# Working directory: treasury-analysis
cp .env.example .env  # only if you do not already have one
chmod 600 .env
# Edit .env with your local keys and explicitly approved payment limits.
npm run live:check   # address validation and RPC balances; no transfers or payments
npm start
```

The payment limits default to zero. After approving spending, set both
`TESTRIL_CHARGE_CAP_USDC=0.1` and `TESTRIL_ESCROW_CAP_USDC=0.1`, then restart.
This version permits at most 0.1 test USDC for each. The first paid request deposits
the escrow allowance; subsequent requests reuse the channel with cumulative
vouchers. A deposit is not a read charge. Quotes must use Base Sepolia USDC and the
supported batch settlement terms; other networks are refused.

With valid local keys and nonzero caps, the app opens **Live** automatically.
Select **Refresh**, beside Reset demo, for a new snapshot. That action prepares and reads one
block for each balance and compares the exact results with the reference RPC.
Sending a transfer waits for one block confirmation (receipt polling every 200 ms),
then refreshes balances and reads transfer
edges at the transaction's block. Each transfer's transaction/log evidence comes
from RPC; Testril's edge is the aggregate for a sender/recipient pair in that block.
The provenance dialog labels these separately. No transaction-level MCP lineage
is implied. Replay and provenance inspection use cached results and add no charge.

**Wallet balances show the full amounts returned by Testril**. The header shows
the configured MCP server URL in Live mode. Each wallet shows its public address
below a bar proportional to its share of the total USDC displayed across the three
demo wallets; the separate payer is excluded. Bars wait until all three balances
have been read. Source blocks are available in balance provenance. Until a
successful read, a wallet shows “Not yet read.” Failed refreshes report an error
and retain the last successful reads. Live transfer
replay keeps those wallet balances visible; it does not calculate historical wallet
balances. All USDC held by Treasury, A, and B is available to the demo. Transfers
must fit within the sending wallet's balance. Refresh accepts deposits or withdrawals
made outside the demo. Run exports include the latest verified balances in
`balances`, `actualBalances`, and `balanceRead`, with the starting snapshot in
`initialBalances`.

All live browser tabs share one session. `.live-state.json` persists wallet balances,
payment usage, cached paid results, and a pending signed transaction. It contains
no private keys, but stays local and is excluded from downloads. **Do not delete
it to reset a run.** Reset returns all USDC from A and B to Treasury, starts new
transfer and payment histories, and refreshes the three wallet balances. The
displayed cost and read count cover the current run. Materialization has separate
payment entries; cached results incur no new payment or paid-read count. Earlier
receipts, cumulative spending, escrow, and caps remain saved. Reset cannot undo
payments or refill a cap. Live run exports include the current run's `receipts`
and all saved payments in `allReceipts`, with cumulative payment totals in
`lifetimeSpentRaw` and `lifetimeRequestCount`.

If a transfer or a later read fails, use **Refresh**. The recorded
transaction hash is recovered without signing another transfer; paid results are
reused. If a settlement response is lost, the charge and deposit remain reserved
and new payments are refused until the quote is reconciled. The interface shows
its quote ID and status. A stalled materialization remains attached to its job.

Only one live server may use this directory. `.live-lock/pid` records its process
ID. Ctrl-C waits for any active operation, releases the lock, and preserves the
saved state. Repeated shutdown signals do not interrupt that cleanup. Startup errors distinguish a running
owner, a stopped owner, and an older lock without an owner record. After a crash,
verify that the old server has stopped before removing only `.live-lock` and
restarting. Keep `.live-state.json`. Failed live startup clears previous mock
balances and history. The caps apply to this saved session,
not to payments made by unrelated clients using the same payer.

For a deliberate testnet smoke run (requires the approved caps and no active run):

```sh
npm run live:smoke
```

This sends 0.25 Treasury → A, then 0.10 A → B, and returns the demo funds to
Treasury. It makes real testnet transfers and pays MCP quotes within the caps.
Maximum gas fee per transfer is limited to 0.0001 ETH.
If that sequence is interrupted, use `node --env-file=.env src/live-cli.mjs
resume-smoke` to recover its pending transaction and continue only the remaining
steps. Use the interface to recover an unrelated run.

## Downloads and CLI

**Download source** exports this standalone project, locked tools, and a digest
manifest, excluding local configuration and installed dependencies. The run export
is available at `/api/sessions/<session-id>/export`; it contains transfers, balances,
receipts, and fictional transfer and balance provenance.

```sh
node src/cli.mjs sample run.json
node src/cli.mjs replay run.json
```

Mock replay checks transfer arithmetic; live replay shows cached Testril wallet balances.
Neither independently verifies chain or MCP evidence. Downloads
are for private evaluation until a repository license is selected.

## Development

```sh
npm test
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser  # desktop + mobile; local port 4175
```

`src/mock-chain.mjs` simulates transfers; `src/mock-testril.mjs` simulates reads.
`src/demo.mjs` connects them. `public/` holds the plain JavaScript interface;
`fixtures/demo.json` sets wallets and rates. Amounts use integer strings and BigInt.
`src/live-demo.mjs` connects the live chain and Testril clients; `batch-payment.mjs`
signs deposits and vouchers. Live tests use a local HTTP MCP peer, with throwaway
keys, to check caps, wallet balances, concurrent tabs, and recovery after restart.
For visual review, try the sequence above on desktop and phone, including keyboard
provenance selection. On desktop, Send and Balances share the left panel while
histories update on the right. Narrow screens stack the panels. Asset origins are in `public/assets/README.md`.

## Scope

The live adapter supports Base Sepolia only. It reads exact balance snapshots and
per-block transfer edges; it does not implement mainnet access, supplier earnings,
wallet-wide historical analysis, or independent verification of every source log.
Testril citations identify contributing blocks and computations. The separate RPC
comparison and receipt check are the reference checks performed by this demo.
