# Testril contract snapshot

`erc20-token-balance-params.json` is the unmodified `params` schema returned by
`inspect { subject: "function", function_slug: "erc20.token_balance" }` at
`https://dev.testril.ai/mcp` on 26 October 2026 (Testril 0.13.0).

The local HTTP peer validates balance bindings against this captured contract.
This catches the removed top-level `tokens` / `owners` arguments instead of
letting a permissive peer accept requests the service refuses. Refresh this
snapshot deliberately when adopting a new Testril contract.
