# Why Provenance Matters: verification materials

This small JavaScript program starts with the saved Testril provenance and independently reconstructs the USDC transfers for two hours on Ethereum. It uses Node.js 22.13 or later and its standard library. No package installation or wallet is needed.

The subject is Ethereum address `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`, a Uniswap V3 pool contract. The token is Ethereum USDC, `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`. The windows are 10 November 2026, 12:00–13:00 and 13:00–14:00 UTC, excluding each window's end.

## Run against Ethereum

From this directory:

```bash
ETHEREUM_RPC_URL=https://rpc.mevblocker.io \
  node verify.mjs input.json my-verification.json
```

The output file must not already exist. Choose another filename to retain multiple runs. Alternatively point `ETHEREUM_RPC_URL` at your own Ethereum node or a service supporting historical `eth_getLogs`, block headers, `eth_call`, the `finalized` block tag and JSON-RPC batches of 40 requests. Some public services restrict historical reads or batch sizes. The program stops on a refused or incomplete response; a failed run is not a verification pass.

The program reads its fixed scope and file paths from `input.json`, loads the saved rows and provenance, and fetches Ethereum records from the supplied service. It makes no calls to Testril or Nansen. Its network requests only read data; it contains no wallet, signing or payment code.

It checks:

1. The network, token decimals, computation identity, requested range and provenance digest.
2. Every block header in each range, including blocks absent from the citations, plus the neighboring blocks needed to verify the time boundaries. Headers must link to one another, cited hashes must match, and the range must precede the node's finalized head.
3. All matching USDC `Transfer` events over the entire range, both incoming and outgoing. A transfer to the same address is counted once as an event and in both directional totals. Distinct events in the same transaction remain distinct.
4. Every returned row, including block, log index, transaction, token, sender, recipient and exact integer amount.
5. The contributing block set and digest independently reconstructed from Ethereum events.

It then calculates incoming/outgoing amounts and every counterparty's transfer count and directional totals. The archive's `results[].counterparties` contains the complete independently calculated lists, not just a selected example.

The terminal prints a concise result. The output file retains all results, request parameters, log responses and the block-header fields used by the verifier. Unrelated header fields, such as transaction lists, are omitted. This is an evidence archive, not a packet capture.

## Recorded evidence

`data/` contains the previously exported Testril rows and the separately retrieved provenance. The provenance cites 172 contributing blocks for the first hour and 200 for the second. There are 299 blocks in each requested window, so checking only cited blocks would leave an omission risk. The program checks headers and searches logs across all 598 blocks.

`evidence/mevblocker.json` contains the successful external Ethereum responses and reconstructed results. `evidence/mevblocker-result.json` is the concise terminal output. The result is 292 matching transfers in the first hour and 503 in the second, with exact amounts and matching provenance digests. `SHA256SUMS` identifies the files in this bundle; it protects against accidental changes, not against someone replacing the bundle and its checksums together.

The `data/comparison-*` files preserve the normalized Nansen/Testril comparison that motivated this check, without payment details or proprietary labels. They are background evidence; the verifier does not need Nansen's data to reconstruct Testril's answer. `evidence/comparison-check.json` records that all 93 and 158 published Testril counterparty totals agree with the independently reconstructed totals, and that Nansen's transaction listings agree with the verified transfers.

Amounts ending in `_atoms`, and each row's `value`, are integer USDC units: divide by 1,000,000 for USDC. JavaScript `BigInt` preserves exact arithmetic. The verifier independently decodes Ethereum events; it does not run Testril's implementation.

The digest encoding is SHA-256 of one lowercase line per contributing block, sorted by block number:

```text
<chain_id>:<block_number>:<0x_block_hash>\n
```

This encoding was checked against Testril's `chain_source_digest` implementation in `crates/core/types-core/src/provenance.rs`, local source revision `955cc85b4c69ce59f338fde601863e923755b158`. The saved provenance names computation `erc20.wallet_transfers`, version 1. A computation identity tells a reader which definition to examine; it is not executable source code by itself.

## Check the verifier

```bash
node --test verify.test.mjs
shasum -a 256 -c SHA256SUMS
```

The tests replay the recorded Ethereum responses and deliberately change amounts, remove transfers, replace events with duplicates, change cited hashes and remove a contributing block from the provenance. They also check hour boundaries, self-transfers, large integers and failed/incomplete/reordered RPC responses. Their temporary local HTTP server stops when the tests finish. These tests do not contact live providers; the command in the first section performs a fresh external check.

## What this establishes

The supplied rows, contributing blocks and computed totals match the Ethereum records returned by the external node for these two windows. The check no longer depends on agreement between Testril and Nansen or a sample of selected receipts.

This is reproducible verification against an Ethereum node, not a zero-trust cryptographic proof. We trust the node to return correct canonical headers and complete logs. The program does not validate Ethereum consensus, rebuild transaction-receipt trees or verify membership proofs against an independently trusted chain head. A reader can run the same code against their own node to choose their source of trust.

The saved provenance was retrieved separately after the original reads, rather than preserved as a signed attachment to the original response. It supplies a source trail we can check; it does not authenticate the original delivery. A correct block fingerprint also cannot, by itself, prove a calculation correct: the code verifies the event selection, rows and arithmetic as well.

This verifier implements one operation, ERC-20 wallet transfers. Other Testril results need verification appropriate to their named computation, following any cited dependencies. Provenance supplies a standard path to those checks; this program is not a universal verifier for every Testril function.

## Protocol references

- [Ethereum JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/): block headers, `eth_getLogs` and network calls.
- [ERC-20 Transfer event](https://eips.ethereum.org/EIPS/eip-20#transfer-1): sender, recipient and integer value.
