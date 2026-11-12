# Allium x402: advertised access and observed failures

Checked 12 November 2026. Research for a proposed blog; no paid execution.

## Finding

All 12 data operations explicitly advertised as machine-payment enabled on Allium's pricing page failed to offer a payment challenge in this check: eight returned HTTP 404, three returned HTTP 401, and SQL submission returned HTTP 503. We could not begin the advertised accountless purchase flow.

This is a dated availability finding. It does not establish deliberate deception, permanent withdrawal, or failure for every user or deployment. It also does not establish that Allium accepted money without delivering data: we signed no payment and spent nothing.

The planned pool-volume comparison is on hold. Switching to another advertised Allium endpoint did not produce a usable alternative during this investigation.

## What Allium promises

The [machine-payment overview](https://docs.allium.so/ai/machine-payments/overview) describes access with USDC and says: “no API key, no subscription, no human in the loop.” Its [endpoint page](https://docs.allium.so/ai/machine-payments/endpoints-pricing) identifies `https://agents.allium.so` as the machine-payment host and lists individual prices.

The official CLI at commit [`d5a2f5e16cf010b26ff32db153fc2f4326eb20be`](https://github.com/Allium-Science/allium-cli/tree/d5a2f5e16cf010b26ff32db153fc2f4326eb20be) still points wallet-payment profiles at that host. Its [x402 client](https://github.com/Allium-Science/allium-cli/blob/d5a2f5e16cf010b26ff32db153fc2f4326eb20be/cli/clients/x402.py) sets `X-Prefer-Payment: x402`. We used that convention.

## The advertised data operations

Requests below used the agents host without an Allium account, API key, cookie supplied by us, or payment signature. The primary sweep ran from 18:16:32 to 18:16:54 UTC on 12 November. Published prices below are not verified current quotes or completed-query costs.

| Method | Path                                        | Published USDC charge | Observed HTTP status |
| ------ | ------------------------------------------- | --------------------- | -------------------- |
| POST   | `/api/v1/developer/prices`                  | $0.02                 | 404                  |
| POST   | `/api/v1/developer/prices/at-timestamp`     | $0.02                 | 404                  |
| POST   | `/api/v1/developer/prices/history`          | $0.02                 | 404                  |
| POST   | `/api/v1/developer/prices/stats`            | $0.02                 | 404                  |
| GET    | `/api/v1/developer/tokens`                  | $0.03                 | 401                  |
| GET    | `/api/v1/developer/tokens/search`           | $0.03                 | 401                  |
| POST   | `/api/v1/developer/tokens/chain-address`    | $0.02                 | 401                  |
| POST   | `/api/v1/developer/wallet/balances`         | $0.03                 | 404                  |
| POST   | `/api/v1/developer/wallet/balances/history` | $0.03                 | 404                  |
| POST   | `/api/v1/developer/wallet/transactions`     | $0.03                 | 404                  |
| POST   | `/api/v1/developer/wallet/pnl`              | $0.03                 | 404                  |
| POST   | `/api/v1/explorer/queries/run-async`        | $0.01 submission      | 503                  |

The 404 body was `{"detail":"Not Found"}`. The three token endpoints returned `{"detail":"Authentication Required."}`. SQL returned `{"message":"This endpoint is currently unavailable."}`.

The table covers the pricing page's 11 realtime operations and raw SQL submission. It excludes saved-query execution, polling, and results: the page labels those API-key authenticated, despite the CLI's intended wallet-only SQL flow. That discrepancy remains unresolved; we did not obtain a real paid run on which to test retrieval.

## Wider investigation

We also probed every one of the 23 realtime endpoint paths returned by Allium's free chain-discovery response, plus SQL, market discovery, schema discovery, and documentation discovery: 30 requests in the retained sweep altogether. The final three Hyperliquid checks completed at 18:18:51 UTC.

| Additional surface                                                             | Observed result | What it means                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Wallet holdings history; historical P&L; token-specific current/historical P&L | 404             | The CLI exposes these, but the checked routes did not offer payment negotiation.                                               |
| Wallet DeFi positions                                                          | 401             | No accountless challenge obtained.                                                                                             |
| Token transfers; asset list and batch lookup                                   | 401             | General API capabilities; not all explicitly advertised as x402-enabled. Do not count them as additional broken x402 promises. |
| Hyperliquid info, fills, order history, order status                           | 404             | No accountless challenge obtained; not a claim that every Hyperliquid API is advertised for x402.                              |
| Market listing; schema browse and search                                       | 404             | Exploratory checks outside the 12-operation headline.                                                                          |
| Chain discovery; documentation browse and search                               | 200             | These free discovery requests worked. They are not purchased blockchain data.                                                  |

Totals for the 30-request sweep: **19 × 404, 7 × 401, 1 × 503, 3 × 200, zero × 402**. These totals are not an uptime percentage or 30 separate advertised paid products. [Timestamped observations](2026-11-12-allium-x402-observations.json)

Supplementary checks, outside that count:

- The agents landing page and advertised skill URL returned HTTP 503 with an HTML message saying the service was disabled.
- Price requests without the preference header, with a trailing slash, and with the documented Solana token example still returned 404.
- A correctly shaped balance request without the preference header still returned 404.
- Price and token-lookup requests to `https://api.allium.so`, with the x402 preference header, returned 403 authentication errors. The ordinary API host did not provide an alternative payment flow in these checks.

The successful free responses show the domain was reachable. They do not identify the cause of the failures. A routing problem, disabled payment deployment, changed access policy, or another operational issue could explain the observations; none has been confirmed.

## History that the article must retain

- **18 October:** the [earlier research note](2026-10-18-allium-accountless-access.md) records 402 responses for balances, prices, and SQL submission. No paid delivery was completed then either. Do not write that the payment interface never existed or never responded.
- **5 November:** the [materialization investigation](2026-11-05-pool-volume-materialization-scope.md) records the SQL 503 blocker.
- **12 November:** SQL still returned 503; the broader sweep found the failures above. These are observations on particular dates, not proof of a continuous outage between them.
- Paul reports posting a question on X. The post URL, exact date, and any replies have not been captured in this evidence bundle. Do not claim Allium ignored him or refused to answer.

## Reproduce three central failures without spending

Run from any directory with curl. These requests contain no credentials, signer, or payment. USDC's public Ethereum token address is used only as a data-query input; it is not a destination for a transfer.

```bash
curl --disable --silent --show-error --include --max-time 20 \
  'https://agents.allium.so/api/v1/developer/prices' \
  -H 'Content-Type: application/json' \
  -H 'X-Prefer-Payment: x402' \
  --data '[{"chain":"ethereum","token_address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}]'

curl --disable --silent --show-error --include --max-time 20 \
  'https://agents.allium.so/api/v1/developer/tokens/chain-address' \
  -H 'Content-Type: application/json' \
  -H 'X-Prefer-Payment: x402' \
  --data '[{"chain":"ethereum","token_address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}]'

curl --disable --silent --show-error --include --max-time 20 \
  'https://agents.allium.so/api/v1/explorer/queries/run-async' \
  -H 'Content-Type: application/json' \
  -H 'X-Prefer-Payment: x402' \
  --data '{"parameters":{"sql":"SELECT 1 AS value"}}'
```

Record the UTC time, status, and response before publication. A later 402 would show that payment negotiation has resumed; a bounded paid request and returned data would still be needed to verify delivery. The retained JSON is a summarized observation log, not a packet capture or complete archive of every response header and body.

## Interpretation for the blog

The substantiated criticism is that the published accountless-access promise was not usable through the documented routes when checked. Developers were left with failures and no verified alternative purchase path. It is reasonable to call that experience **x402 theatre**, clearly presented as an editorial judgment grounded in the results above.

Do not turn that judgment into allegations of fabricated transactions, theft, fraud, intentional deception, or a universally nonfunctional Allium product. The ordinary authenticated API and hosted MCP are separate offerings; this investigation does not benchmark them. x402 can coexist with account-based access. The criticism concerns Allium's specific advertised accountless path.

Disclose that the author works on Testril and originally wanted a real comparison. We have no completed benchmark proving Testril faster or cheaper. No payment was attempted, so wallet funding, signature construction, and settlement were never reached.

## Questions for Allium

1. What is the current production URL for accountless x402 data access?
2. Which operations are enabled, and why do the advertised routes return 401, 404, or 503?
3. Is the service temporarily unavailable, retired, or undergoing a migration? Where is that status documented?
4. Can a buyer submit SQL, poll it, and retrieve results with only a wallet payment?
5. Will you provide a reproducible wallet-only example and update the public docs to match the deployed service?

These questions are prepared for Paul; they have not been sent by the agent. Record any answer and successful retest as a dated update. The [blog outline](../blog-outlines/2026-11-12-allium-x402-theatre.md) turns this evidence into an argument.
