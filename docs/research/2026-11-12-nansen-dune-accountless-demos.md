# Accountless comparisons with Nansen and Dune

Checked 12 November 2026. Recommendation and unpaid endpoint investigation; no paid data delivery or benchmark completed.

**13 November update:** a [paid wallet-statement trial](2026-11-13-wallet-statement-paid-trial.md) returned 292 matching transfers from Nansen and Testril with payment evidence. The counterparties trial found an unresolved time-window mismatch. Dune remains untested with payment. The unpaid observations below retain their original date.

## Recommendation

Start with **Nansen versus Testril: a USDC wallet statement**. Nansen offers x402 without an account and returned live Base USDC payment challenges. Both providers can therefore use the same payment network. Compare a named wallet's payments over a short, completed historical interval.

If the objective is accountless data access rather than x402 specifically, **Dune could replace Allium in the known-pool volume demo**. Dune's SQL endpoint returned a payment challenge too, but its documented accountless service uses MPP on Tempo. That changes wallet setup and payment accounting.

Both got further than [Allium in today's checks](2026-11-12-allium-x402-state.md). This establishes reachable payment negotiation, not successful purchase or data equivalence. The next decision should follow a small paid reconciliation exercise, before building a public interface.

## What responded

Requests supplied no account, API key, cookie, or payment signature. The retained sweep ran from 18:55:28 to 18:55:34 UTC. [Request bodies and decoded challenges](2026-11-12-nansen-dune-observations.json)

| Provider and operation                         | HTTP result               | Payment offer observed                 |
| ---------------------------------------------- | ------------------------- | -------------------------------------- |
| Nansen current wallet balance                  | 402                       | 0.01 USDC on Base                      |
| Nansen historical wallet balances              | 402                       | 0.01 USDC on Base                      |
| Nansen wallet transactions                     | 402                       | 0.01 USDC on Base                      |
| Nansen token transfers                         | 402                       | 0.01 USDC on Base                      |
| Nansen wallet counterparties                   | 402                       | 0.05 USDC on Base                      |
| Nansen Smart Money holdings                    | 402                       | 0.05 USDC on Base                      |
| Dune raw SQL, default/medium/large performance | 402 in all three requests | Tempo session challenge; details below |

Nansen's offers used x402 version 2, scheme `exact`, network `eip155:8453`, and Base USDC asset `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Quoted amounts were 10,000 or 50,000 atomic units. These are per-request quotes, not the cost of a complete paginated report. No payer-specific promotional quote was requested.

Its public [discovery manifest](https://api.nansen.ai/.well-known/x402) returned 93 resources. We checked six representative endpoints, not all 93. Its [payment documentation](https://docs.nansen.ai/getting-started/agentic-payments/x402-payments) explicitly allows access without a Nansen account. Labels and premium labels require an API key; do not build an accountless comparison around them. The page inconsistently lists DeFi holdings as both included and excluded, so that is not a recommended starting point.

Dune's [MPP documentation](https://docs.dune.com/docs/agents/mpp) offers raw SQL execution and JSON/CSV results without an account or API key. Its walkthrough also polls execution status. The payment flow uses a funded Tempo channel and signed vouchers; unused funds are returned when the session closes. We found no documented Dune x402 route in this investigation. HTTP 402 alone does not identify x402.

For `SELECT 1 AS value`, Dune's live challenge specified `method=tempo`, `intent=session`, chain 4217, six decimals, currency `0x20c000000000000000000000b9537d11c60e8b50`, `amount=4000000`, and `suggestedDeposit=10000000`. That is four token units in the challenge and a suggested ten-token deposit. **Do not present either figure as measured total query spend.** No session was opened, no query executed, and no result or settlement obtained. Preserve the advertised asset and network rather than treating these funds as interchangeable with Base USDC.

## Demo 1: Which USDC payments did this wallet make and receive?

Show two copies of the same wallet statement: transactions, senders, recipients, and incoming/outgoing USDC. Use one named public wallet, one token contract, and a completed short window on Ethereum or Base. The observed probes used Ethereum; confirm the chosen chain and wallet in the paid trial.

Nansen supplies [wallet transactions](https://docs.nansen.ai/api/profiler/address-transactions) or [token transfers](https://docs.nansen.ai/api/token-god-mode/token-transfers), quoted at one cent per request. Testril supplies `erc20.wallet_transfers`; the demo formats the rows and calculates totals. This uses an existing Testril function and avoids discovering an entire wallet portfolio or materializing a broad pool universe.

Define the comparison before writing the UI:

- Use identical token contracts and interval boundaries, deriving Testril's block range from the agreed timestamps and applying the same final timestamp filter.
- Fetch every page. The documented wallet-transactions page limit is 100; token transfers allows up to 1,000. If separate incoming and outgoing requests are needed, count both and reconcile self-transfers.
- Compare transaction membership first. A transaction can contain several transfer events, so transaction count is not transfer count.
- Nansen's transfer schema exposes numeric amounts and no log index; Testril returns raw integer amounts and log indices. Verify amount precision and preserve repeated transfers. Do not collapse events by transaction hash or promise exact event identity that the other response cannot represent.
- Add exact USDC totals only after the paid fixtures demonstrate compatible precision and inclusion rules. Exclude USD valuations and proprietary labels from equality checks.

The user-visible question is useful and understandable, while the workload is small enough to inspect manually. A prepared recording can show the complete receipt; visitors can connect their own funded wallets to repeat it.

## Demo 2: Who does this wallet transact with?

Show a counterparty table or flow diagram for the same fixed USDC interval: amount sent, amount received, and transfer count per address.

Nansen's [counterparties endpoint](https://docs.nansen.ai/api/profiler/address-counterparties) was quoted at five cents per request. Request wallet-level grouping and token transfers; its per-token records include incoming/outgoing amounts and transfer counts. Testril can aggregate `erc20.wallet_transfers` by the other address.

The Nansen request does not expose a token-address filter in the inspected schema. Select USDC from the returned token details and fetch all relevant pages before ranking counterparties. Use addresses rather than Nansen entity groupings, and reconcile its count definition with transfer-event counts. This is an appealing follow-up to the statement, but has more semantic work than demo 1.

## Demo 3: How much traded through these named pools?

Use Dune as the second provider for the existing pool-volume design: a handful of named Uniswap V3 pools over a fixed historical block interval, with per-pool token amounts and swap counts.

Dune's [raw SQL API](https://docs.dune.com/api-reference/executions/endpoint/execute-sql) lets us express the calculation explicitly. Testril's `uniswap_v3.pool_volume` supports named pools. Use the same swap events, token order, signed-amount treatment, and interval boundaries; return raw integers as strings where needed. Validate the selected Dune tables and SQL against a small event fixture before treating this as equivalent.

This preserves most of the original comparison's purpose and may offer cleaner arithmetic equivalence than Nansen's numeric transfer responses. It is still a proposal: the Dune query, paid result retrieval, and complete cost have not been verified. Tempo funding and channel closure add work to a visitor's live run. Label it an accountless data comparison using different payment protocols.

## What not to lead with

- **Live wallet balances:** Nansen's inspected current-balance schema does not supply an exact block anchor. Two correct providers can disagree because they read different moments. Historical balance snapshot boundaries also need verification.
- **Smart Money rankings or labels:** Nansen's classifications are a separate product, with no equivalent Testril classification established here. Comparing them to raw transfers would answer different questions.
- **PnL or USD portfolio value:** prices, cost-basis rules, and asset discovery introduce more differences than a first benchmark needs.

## Measurement and acceptance

For any candidate, first buy a small bounded result from each provider and reconcile it against public transaction receipts. Preserve request parameters, responses, payment receipts, pagination, timestamps, and arithmetic rules. A 402 can be produced before body validation; today's challenges do not certify that every supplied request body will execute.

Show time to the complete usable answer, including payment negotiation and all required retrieval calls. Also expose preparation and payment setup separately. Record actual charges rather than advertised unit prices.

For Testril, show new materialization separately from reads and state whether data was already available. For Nansen, include every paid page and any actual promotion. For Dune, separate escrow deposits and refunds from consumed funds, include any execution/result/status charges, and close the payment channel. Compare initial and repeated runs transparently; do not silently prewarm one provider.

Keep recorded mainnet runs as the default experience and require visitors to fund their own live runs. No public shared wallet is needed. No application changes, payments, or benchmark claims were made in this investigation.

## Reproduce the payment challenges

Run from any directory with curl. Neither request pays or requires a private key.

```bash
curl --disable --silent --show-error --include --max-time 20 \
  'https://api.nansen.ai/api/v1/profiler/address/transactions' \
  -H 'Content-Type: application/json' \
  --data '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045","chain":"ethereum","date":{"from":"2026-11-10T12:00:00Z","to":"2026-11-10T13:00:00Z"},"filters":{"token_address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},"hide_spam_token":false,"pagination":{"page":1,"per_page":10}}'

curl --disable --silent --show-error --include --max-time 20 \
  'https://api.dune.com/api/v1/sql/execute' \
  -H 'Content-Type: application/json' \
  --data '{"sql":"SELECT 1 AS value"}'
```

Nansen returned a base64-encoded `PAYMENT-REQUIRED` header describing x402 offers. Dune returned `WWW-Authenticate: Payment` with a Tempo session challenge. Recheck both before committing to implementation; these observations are dated.
