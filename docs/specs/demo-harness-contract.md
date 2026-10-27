# Demo and harness failure contract

This is the contract for new hosted demos and for changes to existing demo
integrations. It defines failure reporting and the ownership boundaries that
make it reliable. Each demo remains independently understandable and runnable.

**Adoption status:** the Move Money demo documents its implementation and complete
catalog in [its standalone failure guide](../../demos/treasury-analysis/docs/errors.md).
Harness adoption and verification of the actual demo/adapter pair remain separate
requirements. This document does not establish that a deployed harness implements
the contract. Record adoption in each demo's own documentation.

## Ownership

This public file is the single authoritative hosting integration specification.
Harness maintainers maintain its hosting requirements, adapter boundary,
acceptance criteria, and coordinated release process with affected demo developers.
Each demo owns its domain semantics, failure catalog/detail schemas, provider
normalization, durable state, and reconciliation. Changes to this contract require
coordination with affected demos. Harness onboarding guides and adoption records
must link here rather than introduce competing specifications. Demo developers
and users need no access to private harness documentation.

| Concern      | Demo                                                                                | Demo-specific harness adapter                       | Common harness                                                                   |
| ------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Execution    | Provider calls, calculations, transactions, evidence, and durable domain state      | Connects the demo to hosted resources and hooks     | Allocates resources and manages visitor sessions                                 |
| Failures     | Identifies domain failures using stable codes and safe context                      | Validates and translates supported demo failures    | Produces hosted responses, request references, logs, and operator records        |
| Presentation | Standalone CLI and local interface                                                  | Supplies hosted descriptions for supported failures | Renders hosted messages, HTTP status, and references                             |
| Spending     | Reports quotes and actual charges; respects authorization hooks and standalone caps | Connects authorization hooks and accounting         | Authorizes sponsored spending, reserves cleanup funds, and enforces lease limits |
| Recovery     | Reconciles its payments and transactions; preserves uncertain state                 | Exposes the demo's recovery operations              | Schedules recovery, quarantines resources, and controls admission                |
| Verification | Provider contract tests and compatibility/smoke commands                            | Tests the actual demo through the hosted boundary   | Verifies release revisions, deployment configuration, and hosting policy         |

The adapter lives in the private harness repository. It may import the demo's
documented exports. A demo must not import the harness, sibling demos, or shared
repository tooling to run. Do not introduce a common demo framework to implement
this contract.

The common harness handles hosting concepts. Function names, wallet roles, and
provider-specific failure interpretation belong in the demo and its adapter.

## Demo interface

Each participating JavaScript demo exports this synchronous function from its
self-contained `src/errors.mjs` module:

```js
export function describeFailure(error) {
  // Return a descriptor for this demo's recognized domain failures.
  // Return undefined for every other value.
}
```

The descriptor has exactly two top-level fields:

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

- `code` is a stable, documented identifier. Its meaning must not depend on an
  error's wording or constructor name.
- `details` is a plain record with an explicit schema for that code. Use an empty
  record when no context is needed. Define allowed fields, types, enums, and
  bounds in the demo's documentation. Values must be bounded, JSON-safe data;
  arbitrary objects, executable accessors, and provider payloads are excluded.
- The descriptor contains no HTTP status, public request reference, retry
  instruction, raw exception, stack, or `cause`. The adapter determines hosted
  presentation and the harness determines hosting policy.
- Human-readable error messages remain useful to the demo's CLI and local
  interface. Consumers must never parse those messages to classify a failure.

`describeFailure` must recognize only errors deliberately constructed by the
demo. Checking that an arbitrary exception has a plausible `code` or `name` is
insufficient. Use module-owned identity, such as a private brand or membership
set. The function must return `undefined` without throwing for unexpected values,
including objects whose properties throw when read. It must not search arbitrary
`cause` chains for a recognizable error.

Provider errors should be normalized where the demo knows which operation
failed. For a binding refusal, preserve the supported refusal reason and add the
Function slug and wallet ID there. Do not label a transport failure as a schema
rejection or infer either from text. Preserve codes and structured context when
adding an explanation at another layer.

Only wrap failures owned by the demo. In particular, a rejected harness payment
or transaction authorization must propagate unchanged; it must not become a
provider failure merely because the rejection happened during a provider call.

## Per-demo failure catalog

Each hosted demo must document its export, supported codes, detail schemas, and
recovery behavior in its own README or local documentation. Include that material
in its standalone source download. Readers must be able to understand its errors
without access to the private harness repository.

These are examples for the Move Money integration, not a mandatory provider
taxonomy for every future demo:

| Demo code                         | Required meaning                                                                     | Example safe context                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `TESTRIL_BINDING_REJECTED`        | Testril explicitly refused a binding                                                 | Function slug, optional wallet ID, validated refusal reason   |
| `TESTRIL_REQUEST_FAILED`          | A Testril request could not complete at the transport boundary                       | Supported operation name, optional allowlisted transport code |
| `PAYMENT_RECONCILIATION_REQUIRED` | A payment outcome is uncertain; another payment must not be authorized automatically | A validated local journal entry identifier, if useful         |
| `TRANSFER_PENDING`                | The submitted transfer has not yet been confirmed                                    | A validated transaction hash, if available                    |
| `JOURNAL_UNAVAILABLE`             | The demo cannot safely persist its operational state                                 | The supported journal operation, excluding filesystem paths   |

For the binding example above, the adapter's detail schema must explicitly
define its accepted Function slugs, wallet IDs, and refusal reasons. An
unrecognized provider reason must be represented by a documented neutral value
or handled as unknown; copying provider text into `reason` is not permitted.

The demo's catalog is authoritative for its semantics. The adapter maintains the
corresponding supported-code mappings. Introducing a new code requires updating
that mapping and its integration tests. Do not add unused codes in anticipation
of future demos.

## Adapter boundary

The adapter obtains `describeFailure` from the same pinned demo checkout and module instance as the
engine. It must translate failures from engine creation and all invoked engine
operations, including refresh, transfer, export/state access, and cleanup where
those operations exist. Both synchronous throws and rejected promises need the
same treatment.

At this boundary:

1. Preserve harness-originated policy faults using the harness's own identity
   check. Their status, classification, and safe message remain intact.
2. Ask the demo to describe its failure. Validate the returned descriptor against
   the adapter's supported codes and exact detail schemas. A throwing classifier,
   malformed descriptor, or unsupported code follows the unknown-failure path.
3. Construct a harness-owned failure with a public classification, safe hosted
   message, HTTP status, and separate validated operator context. Use the
   harness's trusted failure constructor; do not make a plain provider object
   public by assigning `status` or `publicCode` to it.
4. Use a safely generic failure for everything else. Record an adapter-contract
   problem separately when appropriate, without serializing its offending value.

For example, a supported `TESTRIL_BINDING_REJECTED` can map to HTTP 503 and the
existing public code `TESTRIL_UNAVAILABLE_OR_INCOMPATIBLE`, retaining Function,
wallet, and refusal context in the operator record. Preserve existing public
codes when their meaning remains correct. The demo's domain code and the hosted
public code serve different consumers and need not be identical.

Changing an explanatory message must not require changing the mapping. Do not
use exact-message allowlists, message regular expressions, substring matching,
or unrestricted cause traversal as the demo-to-harness protocol.

## Harness responses and diagnostics

Normalize the failure once and carry that classification and safe context through
the request response, failed operation, startup/recovery record, and server log.
Rendering different views of that normalized failure must not discard the
underlying classification or reinterpret its message.

The harness generates the request reference. It must not adopt a demo/provider
`ref`, request ID, status, or public-message property as trusted input. Existing
public JSON errors retain the `error`, `code`, and `ref` fields. Correlate the
response and operator/log records using the harness-generated reference. Recovery
work started later must retain its association with the original operation; it
must not invent a provider reference.

Only approved diagnostic fields may be persisted or logged. A raw exception,
stack, `cause`, request body, signed transaction, credential-bearing URL, private
key, or arbitrary provider response must never be serialized. An unknown error
may retain explicitly approved metadata such as a validated transport error code;
its raw message is not diagnostic context by default.

The demo reports uncertainty and its actual state. The harness decides whether
to end a lease or quarantine a sandbox. An HTTP status or a generic "retryable"
flag is not evidence that repeating a payment or transfer is safe. Recovery must
use the demo's reconciliation operations and existing journals.

## Operation lifecycle

These are requirements to verify, not a statement that every current integration
implements them. The managed lifecycle includes engine creation, execution,
state/export access, response preparation, finalization, cleanup, restart, and
recovery. Reads or response construction after an action still belong to that
request's lifecycle.

Create a harness reference and persist the operation/reservation before chargeable
work. Preserve the primary normalized failure and reference through finalization;
record secondary inspection, persistence, and cleanup failures only as bounded safe
diagnostics. Accounting and busy/lease transitions must complete even if snapshots
fail. A response-construction failure must appear in the operation and correlated
logs without erasing known settlement or causing an executed action to be repeated.

An unreadable snapshot cannot establish that no payment or transaction is pending.
Preserve journals and appropriate reservations, distinguish known financial
outcomes from unknown outcomes, and isolate uncertain resources until safe reuse
is verified. Cleanup cannot erase primary failures or evidence. Restart must
restore durable operations, references, reservations, and isolation. Recovery
reconciles existing work, associates diagnostics with the original operation, and
accounts once; it must not authorize duplicate payments or replacement transactions
automatically. Verify reconciliation, readable state, cleanup, and closure before
making resources available again.

Operator status must remain useful when an individual resource cannot be inspected.
Retain stored safe failures, report bounded per-resource inspection warnings, mark
unreadable pending state as unknown, and continue inspecting other resources. Do
not expose corrupt journal contents or turn one unreadable resource into loss of
all pool diagnostics.

## Compatibility checks and release

The demo supplies a free compatibility check that exercises the provider
operations needed before a paid run. For Move Money this includes binding the
transfer Function and the three balance Functions with the runtime's actual
parameters. Document exactly what the check proves and what it does not prove.
It must not sign payments, submit transfers, or silently run the paid smoke test.

The harness release process is responsible for running the check against the
selected demo revision and configured provider endpoint and recording the result.
Read the deployed revisions from the harness health endpoint rather than assuming
the latest branch is deployed. Paid smoke tests require separately authorized
wallets and spending limits. Local peer tests do not establish live compatibility.

Treat contract adoption as a coordinated change across the demo and adapter.
Select and verify the exact pair before deploying it. Do not claim completion
when one side is implemented only in a fixture. Record the tested and deployed
revisions; do not leave permanent message-matching fallbacks or compatibility
aliases for an older demo revision.

Changing a code's meaning, the export, or required detail fields is an interface
change that requires coordinated adoption. Adding an optional detail still
requires updating the adapter schema before the demo starts emitting it. Human
wording changes are presentation changes and must leave machine behavior intact.

## Acceptance checks

Before hosting a new demo or changing this boundary, verify:

1. The demo's HTTP provider peer can produce meaningful success and failure
   cases, including refusals and transport failures, without live funds.
2. Demo tests verify stable codes, safe context, distinction between failure
   types, and rejection of forged errors. Its standalone CLI/local interface
   remains understandable and independently runnable.
3. An integration test runs the actual candidate demo through the adapter and
   hosted HTTP route. A refused binding has the intended public classification,
   a harness reference, and matching safe context in operator records and logs.
4. Changing the error's human wording while keeping its code and details does
   not change hosted classification. Test a harness authorization refusal too:
   it must retain its policy classification through the demo.
5. Unknown errors, unsupported codes, malformed descriptors, and exceptions
   containing secrets remain generic and do not leak through responses, saved
   records, or logs. Exercise hostile accessors and a throwing classifier.
6. Existing busy responses, sponsored limits, uncertain-payment handling,
   quarantine, cleanup, and request-reference correlation still behave as
   documented. Check engine creation and cleanup failures as well as actions.
7. Persistence failures, malformed nested provider responses, state/export
   failures, and response-construction failures after successful execution preserve
   safe classification, known outcomes, accounting, isolation, and reference
   correlation. Restart and repeated recovery neither double-account nor repeat
   submissions. Operator status survives individual unreadable journals.
8. The exact demo/harness pair passes its applicable release checks. Report live
   compatibility and paid smoke results separately, including any checks not run.

When implementing behavioral changes, run their applicable checks. This document
does not override the standing preference against tests for documentation-only
changes.
