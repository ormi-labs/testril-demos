# Three provider comparisons: trial and build plan

Updated 13 November 2026. Paul authorized paid trials and implementation after feasibility is established. Paid trials are currently blocked by wallet funding; none of the three comparisons is yet verified end to end.

## Deliverables

1. **USDC statement:** Testril versus Nansen, showing a named address's incoming and outgoing payments over a fixed historical interval.
2. **Counterparty flows:** Testril versus Nansen, showing USDC received from and sent to each counterparty over the same interval.
3. **Named-pool volume:** Testril versus Dune, showing swap counts and exact raw token volumes for selected Uniswap V3 pools over identical whole UTC hours.

The [initial research](../research/2026-11-12-nansen-dune-accountless-demos.md) explains the provider schemas and semantic differences. The Allium comparison remains on hold. Dune's accountless interface uses MPP on Tempo; Nansen's uses x402, including Base USDC.

## Verified before spending

Unpaid checks on 13 November established:

- Testril's production MCP endpoint still accepts a binding of `erc20.wallet_transfers` with a named wallet and token list.
- `uniswap_v3.pool_volume` accepts `swap.pool_list` as an explicit array of pool addresses. Factory history is unnecessary for this scope.
- For Ethereum from `2026-11-10T12:00:00Z` to `2026-11-10T13:00:00Z`, both bindings have missing coverage and each returned a **0.03588 USDC preparation offer** on Base. These are quotes, not charges. Read charges remain additional.
- Nansen's token-transfers and counterparties endpoints still returned Base USDC x402 offers of **0.01** and **0.05 USDC** per request.
- Dune raw SQL still returned a Tempo session challenge: currency `0x20C000000000000000000000b9537d11c60E8b50`, chain 4217, amount 4,000,000 atoms and suggested deposit 10,000,000 atoms. Its token's on-chain symbol is `USDC.e`, with six decimals.
- The local demo payer `0x6eA4AB444CD21bd9210D998894585f6148048517` has **zero Base USDC, zero Base ETH and zero Tempo USDC.e**. The three other local demo wallets also have zero Base USDC and ETH. No configured Tempo wallet was found.

The wallet scope checked was `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` and Ethereum USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`. The pool scope was `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`. Successful binding and payment discovery do not establish that the wallet interval contains transfers. Select and verify a nonempty fixture before purchasing the comparison.

Public historical RPC checks did not yield a verification fixture: one endpoint required an archive-access token, and alternatives returned method/range restrictions. Obtain a working archive RPC or public transaction receipts for the chosen interval; never treat those errors as an empty transfer history.

## Funding dependency

Use an existing funded operator wallet if Paul supplies its local configuration path. Otherwise the existing demo payer above can receive Base USDC for the Nansen and Testril trials. One Base USDC provides ample initial headroom; enforce a **one-USDC total Base service-charge limit** for this trial sequence and stop before any quote would exceed it. Exact x402 authorizations do not require the payer to broadcast a Base transaction; check the selected offer rather than adding a gas transfer automatically.

Dune needs separate Tempo funding in its advertised USDC.e asset. Begin with the suggested **ten-USDC.e deposit**, plus a small balance for network fees. Verify the client's fee-token choice and transaction estimate before opening the channel. Escrow funding is not service spend. The four-unit challenge amount does not by itself establish the complete query cost: execution, status and results still need measurement. Do not open or top up another channel automatically if the trial cannot finish within its initial deposit. Close the session and record refunds and any unresolved funds.

Wallet keys must stay in ignored local configuration. Public evidence contains parameters, results, timings and settlement references, never signing keys or payment signatures. No wallet transfer, payment authorization or bridge operation has been performed during the unpaid checks.

## Trial sequence and acceptance

1. Choose a completed Ethereum hour with verifiable USDC transfers, including multiple counterparties. Record block and timestamp boundaries and public transaction receipts. Keep the one-pool volume trial to one completed hour initially.
2. Buy the Nansen statement, retrieving all pages. Buy Testril preparation only if coverage is missing, follow the resulting job, then buy the read. Keep preparation and read receipts separate. Compare transaction membership, direction, amounts and repeated transfers against receipts. The result must be nonempty; two empty responses do not pass.
3. Buy Nansen counterparties with `source_input: Tokens` and wallet grouping. Fetch every page, select USDC from token details, and reconcile incoming/outgoing totals and count definitions with the same Testril transfers. Exclude labels, entity grouping and USD valuation from equality claims.
4. Submit the actual small pool-volume SQL through Dune's MPP session. Validate the chosen source table and signed raw amounts, poll and fetch results within the funded allowance, then close the session. Buy Testril named-pool preparation/read and compare per-hour counts and exact integer volumes. Include boundary, duplicate and zero-volume cases in local verification.
5. Preserve complete public run evidence and an explicit pass/fail result for each comparison. Missing receipts mean uncertain spend; numerical mismatches mean a failed equivalence check. Do not pay again automatically after an uncertain result. Resolve the existing request or channel first.

Nansen exposes numeric transfer amounts and lacks log indices in the inspected schema. Validate precision and multiplicity rather than forcing exact event identity. If the selected API cannot represent the required result, revise that comparison's specification and explain the limitation before building it.

## Implementation after the trials pass

Keep the three demos independently runnable and understandable:

- `demos/wallet-statement/`: fixed report inputs, Nansen pagination, Testril scoped transfers, transaction-level statement and comparison.
- `demos/counterparty-flows/`: fixed report inputs, Nansen counterparties, Testril transfer aggregation and address-level flow comparison.
- `demos/pool-volume/`: retain the existing recording and exact-arithmetic design, replace the unavailable Allium execution path with Dune, use named pools and current RFC 3339 Testril windows. Remove obsolete Allium execution branches from the finished Dune implementation.

Recorded mainnet runs are the default. Live runs use a visitor's own funded wallet with explicit payment approval and bounded charges. Dune needs a Tempo-capable wallet/channel flow, and must expose session closure and refund evidence. Do not ship a shared operator payer to browsers or subsidize arbitrary public queries.

Each demo displays the common question and scope, matched or differing results, time to the complete answer, and actual payment evidence. Show Testril preparation separately from reads and disclose existing shared coverage. Include every paid Nansen page. For Dune, distinguish deposits, consumed funds, refunds and unsettled amounts. Export incomplete attempts as attempts; only verified completed runs become recordings. Keep source archives separate from run exports.

Add realistic HTTP-peer tests for pagination, precision, duplicate transfers, interval boundaries, mismatched results and failed/uncertain payments. Browser tests must exercise the first live action, approvals/cancellation, recording playback and export. Verify each extracted source archive can install and run independently. Include desktop/mobile screenshots and exact startup commands; Paul starts interactive demos himself.

Read the [demo/harness failure contract](demo-harness-contract.md) before any hosted integration. Implement the demo's structured failure catalog and corresponding harness adapter together; test the actual pair, including authorization refusals and unknown failures. Recorded playback needs no signing wallet or sponsored sandbox. Add production routes only after selecting and verifying the hosting boundary.

## Release

Update each README and the root demo index. Run applicable lint, format, behavioral and browser checks once code changes exist. Verify live paid results separately from peer tests. Push complete units to `main`, coordinate any harness deployment, and inspect deployed revisions and user-visible routes before reporting production readiness.

The implementation details above are provisional until paid feasibility passes. Do not label the plan executed, publish invented benchmark recordings, or claim that any of these three comparisons is production-ready from the current unpaid evidence.
