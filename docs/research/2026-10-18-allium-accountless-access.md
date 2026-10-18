# Allium accountless access and a fair Testril comparison

Blog research handoff · checked 18 October 2026 · prepared for Paul and his writing agent.

## Main finding

**Allium offers accountless paid data access through its machine-payment HTTP API. Its hosted MCP server requires authentication.** These are separate interfaces. A claim that “Allium requires an account for x402 access” would misrepresent what we found.

There is a promising accountless SQL path, too. Allium's official CLI implements SQL submission, polling, and result retrieval through a wallet payment client without an Allium API key. Its pricing documentation contradicts that implementation by saying SQL status and results require API keys. We have verified payment challenges and inspected the client, but have **not completed a paid query and retrieved its results**. Resolve that discrepancy before publishing a definitive SQL-access claim or choosing the final demo.

## Paul's position

Paul's stated position:

> I'm 100% against requiring an account for x402 paid data access. Needlessly puts a human in the loop.

The argument to develop: an agent with an authorized, funded wallet should be able to discover a service, obtain a price, pay, and receive the purchased data without a person registering with each supplier. For asynchronous queries, that expectation includes status checks and result retrieval.

Account-based API keys can support unattended operation after setup. The objection is to requiring that separate enrollment before the agent can transact. Wallet funding, spending authority, and key custody still need to be arranged. Accountless access does not remove those responsibilities.

This is a product-design position, not a claim that the x402 protocol prohibits account requirements. Credit Allium for already offering a wallet-only interface; distinguish an authenticated MCP integration from its payment API.

## What the evidence establishes

### Hosted MCP: authenticated access

Allium documents `https://mcp.allium.so` with account OAuth or a bearer API key. An unauthenticated MCP initialization request returned **HTTP 401**. We did not discover a wallet-only mode on that hosted endpoint. This finding concerns that interface, not every Allium service. [MCP overview](https://docs.allium.so/ai/mcp/overview)

### Machine-payment API: no Allium account advertised

Allium advertises USDC payments without API keys or subscriptions at `https://agents.allium.so`. The free supported-chains request returned **HTTP 200** without credentials. Unauthenticated balance, price, and SQL submission requests returned **HTTP 402 payment challenges**, rather than a login requirement. A challenge establishes that payment negotiation is available; it does not prove successful delivery. [Machine-payment overview](https://docs.allium.so/ai/machine-payments/overview)

The official CLI supports signing with a local private key. Its Privy integration is optional; a Privy account is not intrinsically required for Allium x402 access. These are distinct from an Allium account. [CLI authentication documentation](https://github.com/Allium-Science/allium-cli/blob/fe5078b1cc1d50fdad420b06326f80ea229be153/README.md#authentication), [client construction](https://github.com/Allium-Science/allium-cli/blob/fe5078b1cc1d50fdad420b06326f80ea229be153/cli/clients/factory.py)

### SQL: documentation and implementation disagree

The pricing page labels SQL submission as machine-payment enabled, but labels saved-query execution, status, and results as API-key authenticated. It lists submission at $0.01, status at $0.01, and results at a dynamic price. Those entries do not establish the total cost of an accountless query. [Endpoint pricing](https://docs.allium.so/ai/machine-payments/endpoints-pricing)

In contrast, the pinned official CLI source implements `explorer run-sql` using an x402 or Tempo profile, then polls status and downloads results with that same client. The x402 wrapper handles payment challenges for GET as well as POST requests; its construction supplies no Allium account credential. This is strong evidence of an intended complete wallet-only SQL workflow, though client code cannot establish deployed server behavior. [SQL implementation](https://github.com/Allium-Science/allium-cli/blob/fe5078b1cc1d50fdad420b06326f80ea229be153/cli/commands/explorer.py), [x402 client](https://github.com/Allium-Science/allium-cli/blob/fe5078b1cc1d50fdad420b06326f80ea229be153/cli/clients/x402.py)

Unauthenticated status and results requests for a newly generated, nonexistent run ID both returned **404**, not 401. This cannot establish access to a real paid run: the server might look up the run before checking authorization. We did not access another customer's run.

**Correction to the earlier assessment:** an account requirement for SQL result retrieval is documented, but is not established in practice. Do not describe it as a demonstrated blocker.

## Live unpaid observations

Requests made on 18 October 2026, approximately 14:40–14:45 UTC, without an Allium account, API key, cookie, or payment signature:

| Request                                             | Observed response              | What it establishes                                                  |
| --------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| Initialize `https://mcp.allium.so`                  | 401                            | Unauthenticated hosted MCP initialization rejected                   |
| GET `/api/v1/supported-chains/realtime-apis/simple` | 200                            | Free endpoint-specific chain discovery works                         |
| POST `/api/v1/developer/wallet/balances`            | 402; 10,000 USDC atoms ($0.01) | Accountless balance payment challenge; differs from documented $0.03 |
| POST `/api/v1/developer/prices`                     | 402; 20,000 atoms ($0.02)      | Accountless price payment challenge                                  |
| POST `/api/v1/explorer/queries/run-async`           | 402; 10,000 atoms ($0.01)      | Accountless SQL submission payment challenge                         |
| GET status and results for nonexistent run ID       | 404 on both                    | Inconclusive about access to completed paid runs                     |

The observed x402 options were USDC on **Base mainnet, Polygon mainnet, X Layer mainnet, and Solana mainnet**. Base Sepolia was absent. Live balance challenges differed from the published price; a demo should display the actual accepted charge and settlement receipt rather than hardcode the documentation price.

No payment was signed, no paid SQL run was created, and no returned data, latency, or settled total cost was measured in this research. Challenge responses can precede request validation and entitlement checks. A quoted submission price is not a completed-query price.

### Reproduce payment discovery without spending

Run from any directory with `curl`. These requests do not sign or submit a payment:

```bash
curl -i 'https://agents.allium.so/api/v1/supported-chains/realtime-apis/simple'

curl -i 'https://agents.allium.so/api/v1/explorer/queries/run-async' \
  -H 'Content-Type: application/json' \
  -H 'X-Prefer-Payment: x402' \
  --data '{"parameters":{"sql":"SELECT 1 AS value"}}'
```

Payment challenges contain temporary identifiers and recipient details. Keep published examples to the endpoint, status, quoted amount, and network; do not publish wallet keys or signed payment headers.

## Chain selection

Allium's historical coverage matrix includes **Base Sepolia** with raw and decoded data, but marks its DEX and balance categories unsupported. Ethereum Sepolia also lacks prepared DEX coverage. Unichain Sepolia has beta DEX coverage, so “Allium supports no testnet DEX data” would be false. Historical coverage does not establish accountless entitlements to individual tables. [Coverage matrix](https://docs.allium.so/historical-data/coverage), [machine-readable matrix](https://docs.allium.so/historical-data/coverage.md)

Separately, the live realtime chain-discovery response lists Ethereum, Arbitrum, and Base mainnet for wallet balances, but no Base Sepolia. The current Testril endpoint lists data chains Ethereum (`1`), Arbitrum (`42161`), and Base Sepolia (`84532`). **Ethereum or Arbitrum is therefore the practical common starting point.** These Testril values came from live `inspect` calls at `https://dev.testril.ai/mcp`.

Base Sepolia raw-log SQL might still support a custom volume calculation. That requires verifying table access and decoding, rather than assuming prepared DEX coverage. It adds implementation work without improving the initial comparison.

Keep the **chain being analyzed** separate from the **network used to pay**. An Ethereum data query can be paid for on another network. Record actual settlement networks and distinguish testnet tokens from real USDC spending.

## Recommended demo

### First choice: hourly Uniswap v3 pool volume

Keep the original analytical question: **“How many swaps occurred in this pool, and how much of each token changed hands in each hour?”** Use Ethereum or Arbitrum and a fixed historical window.

The current Testril `uniswap_v3.pool_volume` function returns pool, period, swap count, and raw `volume0`/`volume1`. Its volume definition sums absolute token amounts across swaps; it does not supply USD valuation. This comes from the live function card, inspected through `inspect` with `subject: "function"` and `function_slug: "uniswap_v3.pool_volume"`.

Its binding selects a factory through `swap.pool_list.factory`, rather than one pool. For the strictest comparison, request hourly volume for the same factory's pools on both sides, then select a pool for display. If narrower reads are available, verify their scope and billing explicitly. Include factory discovery and swap dependencies in preparation costs.

Use Allium's wallet-paid SQL path to aggregate the same swaps, subject to one complete paid verification. Its documented DEX trade schema offers a starting point; inspect actual fields and reconcile to events before claiming equivalence. If normalized trade rows change event semantics, aggregate raw Swap logs instead. [DEX trade schema](https://docs.allium.so/historical-data/supported-blockchains/evm/core-schemas/dex/trades), [Uniswap v3 event definition](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol)

Match chain, pool, token ordering, block range, UTC hour boundaries, event counts, raw integer precision, and empty-hour handling. Avoid comparing a pool's raw token volume with Allium's market-wide USD price statistics. Validate arithmetic independently before benchmarking.

The Allium side would use its payment HTTP API or CLI, not its authenticated hosted MCP endpoint. A local MCP wrapper is possible, but must be identified as our adapter. Describe the comparison as the same data task through accountless interfaces.

### Fallback: the two token balances of a Uniswap v3 pool

If SQL cannot complete without enrollment, compare Allium's wallet-balance payment endpoint with Testril `erc20.token_balance`, using the pool contract as the sole owner and explicitly selecting its two tokens. Compare raw balances at matching block heights, not independently sampled “latest” values. This measures contract token inventory; do not call it active liquidity or USD TVL. Allium exposes block metadata and raw balance strings. [Balance response schema](https://docs.allium.so/api/developer/wallets/latest-token-balances)

Use a v3 pool contract for this fallback. A v4 singleton manager's aggregate wallet balance does not isolate an individual pool.

## Timing and spend methodology

Show Testril preparation separately from paid reads. Existing materialized coverage may have been bought by another user; Paul may also pre-materialize it. Inspect coverage, identify who paid where known, and charge only missing work. Label reused coverage and its expiry. Do not force fresh materialization for every visitor. [Coverage and retention](https://testril.si/agents/coverage/), [data liquidity and rewards](https://testril.si/agents/rewards/)

Display preparation time/spend, request-to-usable-result time/spend, and optional cumulative totals. Include Allium submission, polling, result retrieval, pagination, retries, and any additional payments in its completed-query measurement. Include payment negotiation on both sides. Distinguish application caching from provider caching and disclose freshness and selected ranges.

The live Testril pricing card reported materialization at $0.00012/block, a $0.00002 read base, and $0.000001 per queried block. These are unit rates, not a benchmark result: inspect actual quotes, dependency work, and receipts. No relative speed or savings claim is justified yet.

## TODO: Testril payment policy

- [ ] Consider requiring real USDC for Testril service usage even when querying testnet data. Testnet payments do not offset real infrastructure costs or provide an economic barrier to abuse; assess the implications for public demos and development access before changing policy.

## Demo implementation update

Paul selected mainnet recordings with optional visitor-funded fresh runs. The [initial local implementation](../../demos/pool-volume/README.md) targets Ethereum pool volume and Base mainnet USDC payments on both sides, assuming Testril's mainnet rail will be enabled. It ships no measured recordings and leaves fresh runs disabled until vendor verification and suitable coverage are complete.

An unpaid live quote on 18 October for the three-hour Ethereum report requested **1,661.2092 test USDC for 13,843,410 materialization blocks**. The bound function had no cached coverage; factory history and dependencies broaden preparation beyond the displayed pool and window. Nothing was paid. This is nominal test-token pricing, not actual real-USDC spending or a future mainnet quote. The demo rejects preparation beyond its visitor cap; operator preparation, reusable coverage, or narrower scope must be resolved before launch.

## Before a blog makes comparative claims

1. With a bounded, funded wallet and no Allium credentials, complete `SELECT 1` through submission, status, and results; record all charges and failures.
2. Verify accountless access to the exact Ethereum or Arbitrum tables required for the pool calculation.
3. Reconcile both providers' outputs over identical events and boundaries.
4. Measure repeated runs and report variation, preparation, and read charges separately.

The supported story today is that authenticated MCP and accountless machine payments coexist, and that agents need a complete purchase-to-result path. Allium's documented accountless offering deserves explicit recognition. Whether its deployed SQL path delivers that complete experience remains to be verified.
