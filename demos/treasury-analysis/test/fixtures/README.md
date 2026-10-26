# Testril contract snapshot

`erc20-token-balance-params.json` and `erc20-transfer-edges-params.json` are the
unmodified `params` schemas returned by `inspect { subject: "function",
function_slug: "<slug>" }` at `https://dev.testril.ai/mcp` on 26 October 2026
(Testril 0.13.0).

The local HTTP peer validates both live Function bindings against these captured
contracts. This catches the removed top-level `tokens` / `owners` balance
arguments, and future transfer-edge changes, instead of letting a permissive peer
accept requests the service refuses. Refresh these snapshots deliberately when
adopting a new Testril contract.
