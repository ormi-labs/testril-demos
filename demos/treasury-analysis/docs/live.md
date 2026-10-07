# Live Base Sepolia

[Back to setup and the mock walkthrough](../README.md). All commands below run
from the `treasury-analysis` directory.

Use four dedicated test wallets: Treasury, Counterparty A, Counterparty B, and a
separate Testril payer. Treasury needs at least 1 test USDC; each wallet that sends
transfers needs Base Sepolia ETH for gas. The payer needs test USDC for escrow.
Use Circle USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, chain ID **84532**.

Copy [`.env.example`](../.env.example) to `.env` and set the four private keys
locally. Set all four public address variables to match your keys. Addresses
otherwise default to [`fixtures/live.json`](../fixtures/live.json), which records
the original demo wallets. A signer must match its configured address.
Keep keys out of chat, browser code, and source control.

```sh
# Working directory: treasury-analysis
cp .env.example .env  # only if you do not already have one
chmod 600 .env
# Edit .env with your local keys and explicitly approved payment limits.
npm run live:check   # address validation and Testril chain head; no transfers or payments
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
block for each balance, using Testril’s reported chain head. Balance reads and
transfer-edge reads come exclusively from Testril. The local signer uses
`https://sepolia.base.org` (or `BASE_SEPOLIA_RPC_URL`) to prepare, submit, and confirm
wallet transactions.
Send checks the last successful Testril balance, then waits for one block
confirmation (receipt polling every 200 ms). It refreshes only the sender and
recipient, together with transfer edges, at the confirmed transaction's block.
These materialization and read pipelines run in parallel; the uninvolved wallet
keeps its last Testril balance. Opening Live mode loads the saved session; select
Refresh to obtain the first snapshot. Refresh and Reset read all three wallets.
Reset refreshes balances before choosing sweep amounts. Each transfer's
transaction/log evidence comes from RPC; Testril's edge is the aggregate for a sender/recipient pair in that block.
The provenance dialog labels these separately. No transaction-level MCP lineage
is implied. Provenance is fetched only when you open a source dialog, then cached
for that snapshot; this metadata adds no charge. Run exports contain read evidence
and any citations already requested. Replay uses cached results.

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
made outside the demo. Run exports include the latest Testril balances in
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

Live Send opens a progress modal with separate **Base Sepolia · RPC** and
**Testril** sections. RPC shows preparation, submission, and confirmation; Testril
shows materialization, payment, and reading. Each section shows its wall-clock
time, alongside the total elapsed time. The RPC timer stops when the transfer is
confirmed; Testril time includes its parallel work without adding overlapping
call durations. Activity comes from the running server operation. Local progress
checks add no Testril calls or charges. The modal closes when the response updates the balances
or reports an error. Cached steps are marked “Not needed.” To verify visually,
send a small Live transfer: the modal should show the amount and wallet pair,
update its active steps, then close with the new balances visible. Failure should
close the modal and display the error beside Send.

## How indexing and reads work

**The demo requests and pays for indexing on the fly.** When you click Send,
the application moves USDC, asks Testril for the new balances and transfer data,
and funds any missing data preparation itself. The client chooses the computation,
wallets, and block range, pays for the work, and consumes the results through the
same MCP connection.

Materialization is the indexing step: Testril processes the requested blockchain
range and prepares the function's results for reading. Reading retrieves those
prepared results. **Materialization and reads have separate quotes and charges.**
The Payment History makes both visible: **Materializing** shows the number and
cost of materialization requests; **Reading** shows the number and cost of reads.
Moving USDC also spends ETH for transaction gas, separately from either data cost.

For each Live Send:

1. The local signer prepares, submits, and confirms the USDC transfer through
   Base Sepolia RPC.
2. The demo asks Testril to read the sender's balance, the recipient's balance,
   and transfer edges at the confirmed transaction's block. Wallet balances and
   transfer data come from Testril.
3. If a result is unavailable, the demo requests materialization for that function
   and block range. It receives a quote, pays in USDC through `pay_quote`, executes
   the materialization with the returned payment ID, and waits for its job.
4. It pays the separate read quote, retrieves the prepared result, and updates
   the interface. The three data pipelines run in parallel; their cumulative
   payment vouchers settle in order.

The read/materialize/payment flow is implemented in
[`live-testril.mjs`](../src/live-testril.mjs), connected to transfers and the
interface by [`live-demo.mjs`](../src/live-demo.mjs). Mock mode simulates reads
and assumes preparation has already happened; use Live mode to see paid indexing.

### Materialization can be paid for in advance

**On-demand indexing is a choice, not a requirement.** An application or another
client can request and pay for materialization of the required functions and
block ranges ahead of time. Materialization can cover future block ranges:
the work is funded in advance, and results become readable as those blocks exist
and Testril finishes preparing them.

**With those results already materialized, this demo only needs to pay for reads.**
Its existing read-first logic uses available results directly, without requesting
or paying for materialization again. The prepared ranges must cover the functions
and blocks the demo reads, including new transfer blocks. The RPC transfer still
happens, and reads still have their own charges.

This separates funding data preparation from consuming data. One client can pay
to prepare results ahead of demand; a reader can consume them without funding that
indexing again. The default demo deliberately prepares missing data during the
interactive run so you can see both stages and their costs.

## Transfer timings

Each Live Send prints an `[INFO]` breakdown in the terminal and browser console:
RPC preparation/broadcast/confirmation and the Testril refresh afterward. The
refresh lists per-wallet quotes and reads, payments, materialization, polling
sleeps, and session saves. Concurrent call durations overlap and are not additive.
Use a dedicated Testril payer: channel state is inspected once per refresh and
updated after each successful settlement. Cumulative payment vouchers settle in
order. Materialization jobs are polled every 200 ms.

The server reports its operation time immediately. After the interface updates,
the browser reports the measured Send-click-to-refresh duration back to the local
server, including local HTTP and rendering overhead. Timing reports are temporary;
they add no Testril requests or charges and contain no signed payloads or keys.

RPC submission failures stop the transfer promptly unless the node can find the
exact signed transaction. The saved transaction remains available for recovery;
do not send a replacement just because submission or confirmation failed.
Confirmation waits for one receipt and checks its canonical block, without
transaction-replacement scanning.
