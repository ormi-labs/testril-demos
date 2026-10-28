# Structured failures

Move Money implements a structured failure interface for embedding applications.
Its source download includes the complete interface and catalog below; it has no
runtime dependency on a hosting service or another demo. A hosted adapter must
adopt this interface and verify the actual demo/adapter pair before release.
Implementation here does not establish that a deployed harness has adopted it.

## Export

```js
import { describeFailure } from "./src/errors.mjs";

try {
  await engine.refresh();
} catch (error) {
  const failure = describeFailure(error);
  // undefined: unknown exception; use the embedding application's safe fallback.
  // Otherwise validate its code and details against the adapter's supported catalog.
}
```

`describeFailure(error)` is synchronous. It returns `undefined` for every error
not deliberately constructed by this demo, including ordinary errors with forged
`code`, `name`, or `status` properties and wrappers with a recognized `cause`.
It never reads unknown exception properties or traverses causes. Its return value
is a fresh plain record with fresh `details`; mutating it cannot change subsequent
descriptions.

For a refused balance binding:

```json
{
  "code": "TESTRIL_BINDING_REJECTED",
  "details": {
    "functionSlug": "erc20.token_balance",
    "walletId": "treasury",
    "reason": "invalid_params"
  }
}
```

These two fields are the entire descriptor. There is no message, HTTP status,
request reference, retry flag, raw exception, or `cause` in it. Error wording can
change independently. The harness adapter owns the translation into hosted
classifications and public messages; the harness owns HTTP status and references.

The module uses private identity to recognize errors and validates its finite
catalog when creating them. `demoFailure`, `failureMessage`, and normalization
helpers are used by the demo's own modules; adapters consume `describeFailure`.
An unknown exception must not be made recognizable by copying its properties.

## Detail vocabulary

All current detail values are strings from the finite sets below. All detail
records are plain objects with no extra fields, accessors, nested records, or
arrays. A field marked optional is omitted when unavailable. Each field is
required otherwise. No raw provider reason, address, URL, filesystem path,
transaction payload, or private key belongs in these details.

| Name                     | Allowed values                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `functionSlug`           | `erc20.transfer_edges`, `erc20.token_balance`                                                                            |
| `walletId`               | `treasury`, `a`, `b`                                                                                                     |
| Testril `operation`      | `connect`, `close`, `bind`, `read`, `materialize`, `inspect`, `provenance`, `unknown`                                    |
| `transportCode`          | `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`, `unknown`                                           |
| Testril refusal `reason` | `invalid_params`, `not_found`, `unsupported`, `range_unavailable`, `rate_limit`, `wall`, `state`, `economics`, `unknown` |

`unknown` means the demo could not describe the value using the supported
vocabulary. It is never a placeholder into which provider text may be copied.
Transport codes are read from the immediate error only, without searching causes.

## Failure catalog

An empty schema means `details` is exactly `{}`. The table describes domain
semantics and recovery constraints; the embedding application decides hosted
policy and presentation.

| Code                                | Exact detail schema                                                                                              | Meaning                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TESTRIL_BINDING_REJECTED`          | `functionSlug`, optional `walletId`, refusal `reason`                                                            | An explicit binding refusal. `invalid_params` can indicate a Function parameter incompatibility.                                                                                                                                                 |
| `TESTRIL_OPERATION_REJECTED`        | Testril `operation`, refusal `reason`                                                                            | A non-success operation result, before binding-specific context is added where applicable.                                                                                                                                                       |
| `TESTRIL_REQUEST_FAILED`            | Testril `operation`, `transportCode`, optional `functionSlug`, optional `walletId`                               | An SDK request, connection, or connection-close failure. A failed paid request may have settled; consult the journal.                                                                                                                            |
| `TESTRIL_RESPONSE_INVALID`          | Testril `operation`, optional `functionSlug`, optional `walletId`                                                | The reply lacks a supported response shape or a required Function identifier/row set.                                                                                                                                                            |
| `TESTRIL_PAYMENT_CHALLENGE_INVALID` | Testril `operation`, optional `functionSlug`, optional `walletId`                                                | A payment challenge cannot safely authorize a payment.                                                                                                                                                                                           |
| `TESTRIL_HEAD_UNAVAILABLE`          | `{}`                                                                                                             | Testril did not report a valid Base Sepolia head. There is no RPC fallback for demo reads.                                                                                                                                                       |
| `TESTRIL_CATCHING_UP`               | `{}`                                                                                                             | Testril has not reached the confirmed transfer block within the wait period.                                                                                                                                                                     |
| `TESTRIL_MATERIALIZING`             | `{}`                                                                                                             | Existing materialization has not completed within the wait period. Retain the saved block and job/payment state.                                                                                                                                 |
| `TESTRIL_MATERIALIZATION_FAILED`    | `{}`                                                                                                             | The materialization job reported failure. Inspect existing work before authorizing new work.                                                                                                                                                     |
| `TESTRIL_EVIDENCE_MISMATCH`         | `functionSlug`, optional `walletId`                                                                              | Balance or edge evidence does not match the expected token, block, amount, or transfer.                                                                                                                                                          |
| `PAYMENT_RECONCILIATION_REQUIRED`   | `reason`: `unfinished-request`, `uncertain-settlement`, or `missing-settlement`                                  | A paid or paying journal entry cannot safely be repeated. Preserve it and reconcile; do not authorize a second payment automatically.                                                                                                            |
| `PAYMENT_LIMIT_REACHED`             | `limit`: `charge` or `deposit`                                                                                   | A configured saved-session allowance cannot cover the next payment. Reset and restart do not refill it.                                                                                                                                          |
| `PAYMENT_CONFIGURATION_INVALID`     | `reason`: `unsupported-terms`, `empty-charge`, or `channel-mismatch`                                             | Quote terms or inspected channel identity are incompatible with supported payment signing.                                                                                                                                                       |
| `PAYMENT_RESPONSE_INVALID`          | `{}`                                                                                                             | Payment channel data or raw amounts cannot be used safely.                                                                                                                                                                                       |
| `RPC_CONFIGURATION_INVALID`         | `{}`                                                                                                             | The signer RPC serves a chain other than Base Sepolia. No transfer is signed.                                                                                                                                                                    |
| `RPC_REQUEST_FAILED`                | `operation`: `prepare` or `confirm`; `transportCode`                                                             | RPC preparation or receipt verification failed. `prepare` has not submitted a transaction; `confirm` must preserve pending state.                                                                                                                |
| `RPC_BROADCAST_UNACKNOWLEDGED`      | `reason`: `rate-limited`, `insufficient-gas`, `fee-too-low`, `nonce-conflict`, or `provider-or-connection-error` | Submission was not acknowledged and lookup did not establish acceptance. The saved signed transaction must be reconciled; do not sign a replacement automatically. The reason is diagnostic and does not establish whether submission succeeded. |
| `GAS_POLICY_VIOLATION`              | `{}`                                                                                                             | The transfer's maximum gas fee exceeds the standalone safety limit.                                                                                                                                                                              |
| `TRANSFER_PENDING`                  | `{}`                                                                                                             | A transfer remains pending or confirmation timed out. Recover the saved transaction.                                                                                                                                                             |
| `TRANSFER_CONFIRMATION_PENDING`     | `{}`                                                                                                             | A receipt's block could not yet be established as canonical. Retain pending state.                                                                                                                                                               |
| `TRANSFER_EVIDENCE_MISMATCH`        | `{}`                                                                                                             | The confirmed transaction does not contain the expected USDC Transfer event.                                                                                                                                                                     |
| `TRANSFER_REVERTED`                 | `{}`                                                                                                             | The transaction reverted; USDC did not move, but gas may have been spent.                                                                                                                                                                        |
| `INVALID_WALLETS`                   | `{}`                                                                                                             | Transfer endpoints must be distinct configured demo wallets.                                                                                                                                                                                     |
| `INVALID_AMOUNT`                    | `{}`                                                                                                             | The user amount is malformed, nonpositive, or above the sending wallet's available balance.                                                                                                                                                      |
| `STALE_REVISION`                    | `{}`                                                                                                             | The mutation used an outdated state revision.                                                                                                                                                                                                    |
| `REFRESH_REQUIRED`                  | `reason`: `transfer`, `transfer-evidence`, or `balance-evidence`                                                 | Refresh the saved run before the requested action/evidence is available.                                                                                                                                                                         |
| `LIVE_CLOSING`                      | `{}`                                                                                                             | The engine is shutting down and cannot accept another queued action.                                                                                                                                                                             |
| `JOURNAL_UNAVAILABLE`               | `operation`: `open`, `load`, `save`, or `close`                                                                  | Durable storage could not complete the operation. A failed save prevents subsequent actions until the engine is recreated after storage repair.                                                                                                  |
| `JOURNAL_LOCKED`                    | `reason`: `held`, `stale`, or `unknown`                                                                          | Another process or an unresolved lock prevents opening the journal. Preserve the journal and investigate ownership.                                                                                                                              |
| `JOURNAL_INCOMPATIBLE`              | `{}`                                                                                                             | Saved state belongs to another wallet/token/chain/endpoint configuration.                                                                                                                                                                        |
| `JOURNAL_INVALID`                   | `{}`                                                                                                             | Saved journal text cannot be parsed as JSON. Preserve it for investigation.                                                                                                                                                                      |
| `LIVE_CONFIGURATION_INVALID`        | `{}`                                                                                                             | Local signer identities, wallet separation, or payment caps are invalid or incomplete.                                                                                                                                                           |

The CLI also uses `INVALID_COMMAND` and `SMOKE_SEQUENCE_INVALID`, both with `{}`
details. They describe CLI usage and a saved run that cannot start/resume the
smoke sequence; engine adapters do not receive them.

Read responses validate every advertised materialization range before using it
to decide whether to poll or request new materialization. An absent, null, or
empty list means no work is in progress. Malformed lists or block endpoints
produce `TESTRIL_RESPONSE_INVALID` with `{operation: "read"}`; they cannot trigger
a new materialization payment.

## Authorization and persistence

`authorizePayment` rejections propagate with their original identity. The demo
does not wrap them as Testril failures or expose their messages through the
standalone HTTP response. No settlement is transmitted after a rejected
authorization. Likewise, a harness transaction-authorization rejection from the
supplied chain adapter passes through unchanged. Transfer timing must not replace
a frozen policy error with another exception.

The demo's saved-session caps and the host's sponsored lease caps are independent
constraints. A host authorization rejection remains a host policy decision;
`PAYMENT_LIMIT_REACHED` describes the demo's own configured allowance.

The engine saves payment reservations and signed transactions before submission.
It drains concurrent read/payment pipelines before reporting failure. A journal
save failure takes precedence over a secondary uncertain-payment observation in
another pipeline. Neither a descriptor nor its HTTP presentation grants permission
to repeat a payment or transfer. Reconciliation must use the saved state.

Closing attempts to release both MCP and journal resources. An opening/load
failure retains its primary classification even if cleanup also fails. A normal
journal close failure reports `JOURNAL_UNAVAILABLE` with operation `close`.

## Standalone presentation and checks

The CLI prints the stable code and an authored explanation. Binding schema hints
are shown for `invalid_params`; transport errors do not suggest comparing schema
fixtures. `live:check` binds all four runtime Functions even with zero spending
caps, makes no paid reads, and sends no payments or transactions. An invalid
success reply without a usable Function identifier also fails the check.

The local HTTP server returns recognized `code` and `details` alongside its
existing `error` message. It owns the local status mapping (including 409 for
`STALE_REVISION` and 400 for input refusals). The engine's domain errors have no
HTTP status. Unknown live exceptions receive a generic local explanation without
their message or properties. The hosted adapter applies its own HTTP mapping.

From this demo's directory:

```sh
npm test
npm run test:browser
npm run lint
npm run format:check
```

Tests use local HTTP peers and throwaway keys. They cover schema refusals versus
transport failures, malformed binding replies, stable descriptors despite message
changes, unknown/forged errors and hostile accessors, policy-error identity,
journal failure precedence and cleanup, and local HTTP presentation. Paid live
verification and the paired harness integration checks are separate release work.
