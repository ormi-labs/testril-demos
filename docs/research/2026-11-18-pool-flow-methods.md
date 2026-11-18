# Pool Flows: two retrieval methods

18 November 2026. The demo now offers **All transfers** and **Daily totals**, each
with read price/time, output, and separate preparation/provenance figures. Both
use one complete UTC day, Ethereum USDC and the same Uniswap pool.

- All transfers compares every Transfer event and exact amount using Testril
  `erc20.wallet_transfers` and Nansen address transactions.
- Daily totals compares every counterparty’s USDC count using Testril
  `erc20.wallet_counterparties` and Nansen address counterparties. It compares
  incoming/outgoing token amounts when Nansen supplies both. Missing amounts are
  explicitly unavailable; USD values are not substituted. All summary pages are
  included. It does not purchase either provider’s transaction ledger.

[Testril PR 386](https://github.com/ormi-labs/testril/pull/386) uses these daily
binding parameters:

```json
{
  "function_slug": "erc20.wallet_counterparties",
  "chain_id": 1,
  "params": {
    "swap": {
      "wallet": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      "tokens": ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]
    },
    "by": "day"
  }
}
```

PR 386 changes transfer rows to `counterparty` and `direction` and increments the
source Function version to 2. The current production binding still advertised
version 1 during discovery. The demo normalizes both served formats and retains
the actual source provenance version. New runs always bind again.

Daily provenance cites a wallet-transfer dependency rather than pretending the
aggregate has its own block list. The export retains that citation and the
dependency’s block provenance. Both retrievals belong to the provenance phase.

## Production discovery, without purchases

Both methods passed unpaid discovery against `api.testril.si/mcp` and
`api.nansen.ai` for 10 November 2026. The checked UTC range is Ethereum blocks
`[26380784, 26387957)`. Testril’s old preparation has expired; both materialization
quotes were 0.860760 USDC. Nansen offered 0.010000 USDC per transaction page and
0.050000 per summary page. Offers are not paid delivery or latency measurements.

Nansen’s [current counterparty documentation](https://docs.nansen.ai/api/profiler/address-counterparties)
describes exact UTC bounds and per-token `token_in_amount` / `token_out_amount`
fields. The new parser retains numeric source digits and rejects amounts that
cannot be represented exactly in USDC’s six decimal places. Its absence handling
does not assume every deployed response already contains those optional fields.

The old full-day ledger recording remains unchanged. No new daily-summary
recording or financial authorization was submitted during this implementation.
The historical totals view explicitly shows that it has no recording until a
measured run is saved; old ledger prices/times are never relabelled as totals.

Production publishing remains subject to the harness’s existing Cloudflare
Workers Paid requirement. This update does not change the Move Money sandbox
pool, its quarantines, or its maintenance state.
