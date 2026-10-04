# Build specification: first-release data functions

**3 October 2026 · Target repository: `ormi-labs/testril`**

## Assignment

**`erc20_transfer_edges` is the only new data function to build for the first release.** Verify the existing `erc20_balance` and `erc20_transfer_volume` functions; make corrections only where needed to satisfy this specification. Deliver the changes through a PR with reproducible examples and relevant test results.

| Function | First-release work |
| --- | --- |
| `erc20_transfer_edges` | Build |
| `erc20_balance` | Verify exact historical output; expose `balance_raw` if missing |
| `erc20_transfer_volume` | Verify existing count, volume, and coverage behavior |
| `uniswap_v3_swaps`, `uniswap_v3_liquidity_state` | Outside this assignment; optional later pool demo |
| Vault functions and generated functions | Outside this assignment; later demos |

This document is sufficient to start work without the demo-planning conversation. It specifies backend data functions and their paid serving behavior. Frontend applications, new billing products, function generation, pool/vault functions, and pricing redesign are outside this assignment.

Read the target repository's current `AGENTS.md` and contributor instructions. Use its implementation, naming, review, and testing conventions. The local core checkout is `../testril` relative to the demos repository. Work in an isolated branch; do not modify an unrelated shared integration branch.

## Why these functions are needed

The first release contains three independently runnable projects:

| Project | Data needed |
| --- | --- |
| Token activity CLI | Existing per-block transfer count and raw volume |
| Treasury application | Transfer amounts between addresses, two exact balance snapshots, provenance |
| Independent paid-reader CLI | The same bound transfer-edge function and materialized range, purchased by another payer |

The treasury application computes totals, internal/external classification, and counterparties in client code. Testril must return enough exact data for that calculation and its independent verification. Two customers must be able to reuse token-wide preparation without creating separate wallet-specific edge functions.

## Inspect before implementation

At the inspected core revision `1a73be13`, useful starting points were:

| Path in the core repository | What to inspect |
| --- | --- |
| `sample-functions/erc20_transfer_volume.json` | Event ABI, per-block sum/count, catalog template conventions |
| `sample-functions/erc20_balance.json` | `balanceOf`, wallet binding, exact `balance_raw`, approximate display value |
| `crates/core/function-core/src/compiler/mod.rs:365` | Entity-key validation and compiled source fields |
| `crates/backends/native-backend/src/indexing.rs:34` | Composite event keys rendered as colon-separated values |
| `crates/backends/native-backend/src/reads/values.rs` | Internal row paging and provenance |
| `crates/wire/mcp-server/src/types/read.rs` | Paid public read arguments, returned fields/values, incomplete results |
| `crates/daemon/src/seed.rs` | Installing catalog functions |
| `crates/daemon/tests/common/walks.rs` | Existing catalog, bind, and paid read scenarios |
| `progress/native-functions.md` | Active migration from JSON functions to static Rust functions |

These paths are starting points, not instructions to preserve an obsolete implementation. Recheck the current checkout. The inspected code has composite event keys and exact balance output; their complete paid MCP behavior has not been established for this new function.

Use the currently supported catalog implementation. If JSON templates remain supported, start from the existing transfer-volume template with an event entity key of `from` and `to`. If that catalog has migrated, implement the equivalent static function. Follow the established address normalization and bound-function identity rules.

If the needed behavior requires a small, local serving correction, include it with tests. If it requires replacing the engine or changing the shared migration plan, identify the missing operation, propose the smallest dependency, and record it as unfinished work. Do not silently replace the architecture or advertise an unusable catalog entry.

## 1. New function: `erc20_transfer_edges`

### Binding and scope

Use catalog name `erc20_transfer_edges`, unless the current catalog has an established equivalent; document any naming decision.

Required binding parameters are chain and token contract: `chain_id`, `token_address`. Include an ordinary binding name if the catalog requires it. Do not bind a treasury wallet, team-address set, time range, or threshold into this function. Reads and materialization specify the block range.

Use half-open ranges `[from_block,to_block)`. The function reads one token on one supported chain. Empty or invalid ranges and unsupported chains follow the core API's existing validation and errors.

### Source data

Fetch finalized logs from the bound contract matching:

```text
Transfer(address indexed from, address indexed to, uint256 value)
```

Use the [ERC-20 interface](https://eips.ethereum.org/EIPS/eip-20). Zero-value transfers are events and contribute to the count. Preserve zero-address endpoints and self-transfers. Do not assume the event proves a payment, a person's identity, or the cause of a balance change.

Use the engine's normal source acquisition, finality, metering, persistence, and provenance. No state before the requested range is required to aggregate these events.

### Aggregation

For each block and ordered sender/recipient pair:

```text
amount_raw     = sum of matching Transfer.value
transfer_count = number of distinct matching Transfer events
```

The key is `(block_number,from_address,to_address)` within the bound function. Reverse-direction transfers are separate rows. Identical endpoints in different blocks are separate rows. Multiple legitimate logs with identical amounts/endpoints count separately.

Duplicate delivery or retries must not count the same chain event twice. Use the engine's canonical log identity and idempotent writes. Failed acquisition must not mark unprocessed blocks as covered. Respect finalized block hashes and existing replacement/invalidation behavior.

Represent amounts and counts exactly. Prefer existing checked integer types. For a `u256` sum, detect overflow beyond `2^256−1` and return a meaningful failure; never wrap, clamp, or convert through floating point. Client totals may need wider or signed arithmetic; that calculation is outside this backend function.

### Logical output

Each row must expose these values without loss:

| Field | Meaning |
| --- | --- |
| `block_number` | Block for this aggregate |
| `from_address` | Sender, as a canonical address |
| `to_address` | Recipient, as a canonical address |
| `amount_raw` | Exact sum in token base units |
| `transfer_count` | Exact event count |

Example logical row, using symbolic addresses only for illustration:

```json
{
  "block_number": 100,
  "from_address": "A",
  "to_address": "B",
  "amount_raw": "100",
  "transfer_count": "1"
}
```

This describes required information, not a new public response envelope. Preserve the current `fields`/`values` format and `block` spelling where used. Exact large integer values must survive serialization and parsing; decimal strings are suitable.

Addresses may be separate fields or an existing reversible composite `entity` key. If using the key, document its ordering, normalization, encoding, and decoding with a real example. It must yield both addresses unambiguously without a lookup, RPC call, or uncharged REST fetch. Do not invent transaction hashes: these are per-block aggregates, not per-log records.

Return deterministic results under the current API's ordering rules. Where ordering is unspecified, sort the reproducible example by block, sender, then recipient.

### Empty and incomplete data

A fully covered block with no matching logs has no edge rows. Do not invent a zero-valued edge or fill all known address pairs with zeros. Coverage must allow the caller to distinguish this from missing data.

A completely quiet, covered requested interval must be distinguishable from failure or unavailable coverage. Missing coverage, failed RPC calls, undecodable matching events, and unavailable history must use explicit existing errors or incomplete results; they must not become a successful empty answer.

### Paid serving and reuse

The function must be discoverable, bindable, materializable, and readable through the paid MCP path. Preserve the current quote/payment/execute sequence and request identity. Use existing pricing and reward allocation; do not add a demo-only free path or new rates.

A successful read of a covered range must return all requested pairs and both measures. Inspect the public serving layer, not only the internal backend. At the inspected revision, public MCP does not accept page cursors even though internal reads page. Do not add ignored cursor arguments or silently return only the first internal page.

Exercise responses exceeding an internal page boundary. Either serve the complete range through the existing mechanism or return an explicit bounded-response failure with a usable next step. A successful truncated response is unacceptable. Adding public paid pagination is a separate interface decision, not an assumption of this spec.

Rebinding equivalent chain/token inputs must follow the existing identity rules. Another payer can buy the same covered data without recomputing or purchasing new preparation for that interval. A paid retry must not create a second charge or reward event. Tests should establish the existing accounting behavior through this new function.

### Provenance

Associate the returned values with their bound-function identity/definition and actual contributing source blocks using the existing provenance interface. References must identify chain and block hashes. Explain whether expansion cites the whole selected source range or only contributing blocks, according to actual implementation.

A block digest alone does not verify the sum. The example verification procedure must fetch the reference logs, regroup them, and compare exact amounts and counts. Do not claim transaction-level or per-field lineage if the engine does not provide it.

## 2. Existing balance function

Verify that the existing balance function binds chain, token, and wallet and returns exact historical `balance_raw`. At the inspected revision, the sample already includes a `u256` raw field alongside approximate `balance`; preserve exact values through storage and paid serialization. Add the field only if missing in the supported implementation. Avoid introducing a duplicate balance function.

For treasury movement over `[a,b)`, read end-of-block balances at:

```text
opening snapshot: a−1, read as [a−1,a)
closing snapshot: b−1, read as [b−1,b)
```

Read the two snapshots, not every intervening balance. For an ordinary token:

```text
closing − opening = incoming − outgoing
```

Self-transfers cancel. Mint/burn events must retain the zero address so the client can classify them. A mismatch for a nonstandard token remains a mismatch, with a documented limitation. Do not redefine the edge result to force equality.

The sample must have `a >= 1`. If a caller requests reconciliation starting at block zero, explain that there is no `a−1` snapshot; do not underflow or invent one.

Token decimals are display metadata, not part of raw accounting. ERC-20 makes `decimals()` optional. Reuse existing metadata behavior, but do not make the event function fail just because display metadata is absent. Without known decimals, report base units or require an explicit supported display configuration.

## 3. Existing transfer-volume function

Verify the existing function provides exact per-block raw volume and event count for the bound token. Its count includes zero-value events and its volume includes self-transfers. It describes token-wide activity, not counterparties or economic payment volume.

Its existing documented zero-per-quiet-covered-block behavior differs from sparse edge rows; preserve and document that distinction. Test coverage errors and exact large values through paid MCP. Fix necessary defects without introducing another activity function.

## Acceptance examples

Use distinct valid 20-byte addresses for A, B, and C in tests. Values in this table are raw integers, without decimal scaling.

| Block | Transfer | Raw amount |
| --- | --- | ---: |
| 100 | A → B | 100 |
| 100 | B → A | 30 |
| 101 | A → A | 50 |
| 102 | C → A | 20 |

Over `[100,103)`, the edge function returns four rows, each with count 1. For A alone, external incoming is 50, external outgoing is 100, and net is −50. With opening balance 1,000 at block 99 and closing balance 950 at block 102, reconciliation matches exactly.

For team `{A,B}`, the two A/B transfers and the self-transfer are internal; external team movement is +20 from C. Do not compare this with A's individual balance change. Team reconciliation needs snapshots for all members.

For the existing transfer-volume function, expected per-block `(volume,count)` is `(130,2)`, `(50,1)`, `(20,1)`.

Add a separate aggregation case: two distinct A→B logs in block 100 with values 100 and 7 produce one edge with amount 107 and count 2; a duplicate delivery of either log changes neither result. A→B in block 101 remains a separate row.

### Required implementation checks

Use the core repository's normal test framework and HTTP peer fakes. Cover behavior through catalog/bind/materialize/paid-read/provenance as appropriate, not just a pure aggregation helper.

| Case | Required outcome |
| --- | --- |
| Same endpoints in both directions | Distinct rows and correct sums |
| Multiple logs in one transaction | Each log counted once |
| Zero-value transfer | Amount zero, count one |
| Self-transfer | Row preserved; reference net cancels |
| Mint/burn addresses | Zero address preserved and decodable |
| Values above `2^53` and near `u256` maximum | Exact stored and serialized values |
| Sum above supported maximum | Explicit failure; no wrap or approximate result |
| One-block and adjacent ranges | Exact half-open boundaries; no double counting |
| Quiet covered block/range | Successful empty edges, distinguishable from missing coverage |
| Wrong token or unrelated event | Excluded by source filtering |
| Malformed matching event or failed source request | Explicit failure/incomplete coverage |
| Retry or repeated materialization | Stable results and existing payment idempotency |
| Different sender/recipient pairs across internal pages | Complete successful response or explicit limit failure |
| Partial materialization or expired coverage | Existing coverage error; no fabricated zeros |
| Independent payer reading prepared data | Reuse without new preparation; correct existing reward accounting |
| Historical balance beyond safe floating-point range | Exact raw value in the public response |

Inspect limits from their defining constants and construct cases crossing those limits. Verify failed slices are not marked covered. Use a test-only reference reducer or script to check totals; building the public treasury application's reducer is not part of this task.

## Implementation sequence

1. Read the current core instructions and inspect catalog, event keys, paid serving, balances, and migration status. Record the chosen approach in the core task's progress document.
2. Add the supported catalog function and any narrowly required serving changes. Keep normalization and identity in the existing owners.
3. Add realistic acceptance scenarios, including composite-key decoding, precision, completeness, quiet coverage, and retries. Verify balances and transfer volume.
4. Run the code checks required by the core repository, then document the actual wire shape and reproducible commands.
5. Where live RPC/deployment verification is authorized and available, record one ordinary token and short finalized range with independent event/balance agreement. Use paid deployment operations only within separately authorized spending. Otherwise identify those checks as pending; local/mock success is not evidence of a live purchase or payout.
6. Commit complete units, push, and open a PR under the core repository's handover rules. Include any remaining deployment work and exact missing dependencies.

## Handover requirements

Return the PR URL and a short completion report containing:

- Final catalog name, binding parameters, function version/definition identity, and supported chains/contracts.
- Actual paid read schema and an example showing how to recover sender and recipient.
- Copyable inspection, bind, materialize, quote/pay/read, and provenance commands using placeholders for credentials and payment IDs.
- The synthetic acceptance output and relevant test/check results.
- The exact-balance and transfer-volume findings, including any changes made.
- A recorded live reference, if performed, identifying chain, contract, block range, revision, and verification method.
- Observed quote/reward behavior for the tested environment; do not promise deployment prices from historical rates.
- Remaining rollout, live-payment, or engine work, stated explicitly.

The function is complete when the supported core implementation serves exact, complete, reproducible edge data through paid MCP and the required local/integration scenarios pass. State deployment readiness separately. No demo may claim a live capability until that deployment has been verified.
