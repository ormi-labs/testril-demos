import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const failures = new WeakMap();
const oneOf =
  (...values) =>
  (value) =>
    values.includes(value);
const optional = (validate) => (value) =>
  value === undefined || validate(value);
const wallet = oneOf("treasury", "a", "b");
const slug = oneOf("erc20.transfer_edges", "erc20.token_balance");
const operation = oneOf(
  "connect",
  "close",
  "bind",
  "read",
  "materialize",
  "inspect",
  "provenance",
  "unknown",
);
const networkCodes = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
];
const transport = oneOf(
  ...networkCodes,
  ...Array.from({ length: 200 }, (_, i) => `HTTP_${400 + i}`),
  "MCP_REQUEST_TIMEOUT",
  "MCP_CONNECTION_CLOSED",
  "MCP_ERROR",
  "unknown",
);
const refusal = oneOf(
  "invalid_params",
  "not_found",
  "unsupported",
  "range_unavailable",
  "rate_limit",
  "wall",
  "state",
  "economics",
  "unknown",
);
const bindingContext = {
  functionSlug: optional(slug),
  walletId: optional(wallet),
};

// This finite catalog is the demo's public failure vocabulary. See docs/errors.md.
const schemas = {
  TESTRIL_BINDING_REJECTED: {
    functionSlug: slug,
    walletId: optional(wallet),
    reason: refusal,
  },
  TESTRIL_OPERATION_REJECTED: { operation, reason: refusal },
  TESTRIL_PAYMENT_REJECTED: {
    operation,
    reason: oneOf(
      "cumulative-amount-mismatch",
      "identifier-conflict",
      "invalid-payload",
      "unknown",
    ),
  },
  TESTRIL_REQUEST_FAILED: {
    operation,
    transportCode: transport,
    ...bindingContext,
  },
  TESTRIL_RESPONSE_INVALID: { operation, ...bindingContext },
  TESTRIL_PAYMENT_CHALLENGE_INVALID: { operation, ...bindingContext },
  TESTRIL_HEAD_UNAVAILABLE: {},
  TESTRIL_CATCHING_UP: {},
  TESTRIL_MATERIALIZING: {},
  TESTRIL_MATERIALIZATION_FAILED: {},
  TESTRIL_EVIDENCE_MISMATCH: { functionSlug: slug, walletId: optional(wallet) },
  PAYMENT_RECONCILIATION_REQUIRED: {
    reason: oneOf(
      "unfinished-request",
      "uncertain-settlement",
      "missing-settlement",
    ),
  },
  PAYMENT_LIMIT_REACHED: { limit: oneOf("charge", "deposit") },
  PAYMENT_CONFIGURATION_INVALID: {
    reason: oneOf("unsupported-terms", "empty-charge", "channel-mismatch"),
  },
  PAYMENT_RESPONSE_INVALID: {},
  RPC_CONFIGURATION_INVALID: {},
  RPC_REQUEST_FAILED: {
    operation: oneOf("prepare", "confirm"),
    transportCode: transport,
  },
  RPC_BROADCAST_UNACKNOWLEDGED: {
    reason: oneOf(
      "rate-limited",
      "insufficient-gas",
      "fee-too-low",
      "nonce-conflict",
      "provider-or-connection-error",
    ),
  },
  GAS_POLICY_VIOLATION: {},
  TRANSFER_PENDING: {},
  TRANSFER_CONFIRMATION_PENDING: {},
  TRANSFER_EVIDENCE_MISMATCH: {},
  TRANSFER_REVERTED: {},
  INVALID_WALLETS: {},
  INVALID_AMOUNT: {},
  STALE_REVISION: {},
  REFRESH_REQUIRED: {
    reason: oneOf("transfer", "transfer-evidence", "balance-evidence"),
  },
  LIVE_CLOSING: {},
  JOURNAL_UNAVAILABLE: { operation: oneOf("open", "load", "save", "close") },
  JOURNAL_LOCKED: { reason: oneOf("held", "stale", "unknown") },
  JOURNAL_INCOMPATIBLE: {},
  JOURNAL_INVALID: {},
  LIVE_CONFIGURATION_INVALID: {},
  INVALID_COMMAND: {},
  SMOKE_SEQUENCE_INVALID: {},
};

export function demoFailure(code, message, details = {}) {
  const schema = Object.hasOwn(schemas, code) ? schemas[code] : undefined;
  const fields = Object.getOwnPropertyDescriptors(details);
  if (
    !schema ||
    Object.getPrototypeOf(details) !== Object.prototype ||
    Reflect.ownKeys(fields).some(
      (key) =>
        !Object.hasOwn(schema, key) || !Object.hasOwn(fields[key], "value"),
    ) ||
    Object.entries(schema).some(
      ([key, validate]) => !validate(fields[key]?.value),
    )
  )
    throw new TypeError("Invalid demo failure descriptor.");
  const error = new Error(message);
  const safeDetails = Object.fromEntries(
    Object.entries(fields)
      .filter(([, field]) => field.value !== undefined)
      .map(([key, field]) => [key, field.value]),
  );
  failures.set(error, { code, details: safeDetails, message });
  return error;
}

// Identity, not name/code/message properties, makes an exception recognizable.
export function describeFailure(error) {
  const description = failures.get(error);
  return (
    description && {
      code: description.code,
      details: { ...description.details },
    }
  );
}

// Local presentation uses authored text, never an arbitrary exception's message.
export function failureMessage(error) {
  return (
    failures.get(error)?.message ??
    "Live operation failed. Inspect the saved state and refresh."
  );
}

export function testrilOperation(value) {
  return operation(value) ? value : "unknown";
}

export function refusalReason(value) {
  return refusal(value) ? value : "unknown";
}

export function transportCode(error) {
  try {
    const code = error?.code;
    if (
      error instanceof StreamableHTTPError &&
      Number.isInteger(code) &&
      code >= 400 &&
      code <= 599
    )
      return `HTTP_${code}`;
    if (error instanceof McpError) {
      if (code === ErrorCode.RequestTimeout) return "MCP_REQUEST_TIMEOUT";
      if (code === ErrorCode.ConnectionClosed) return "MCP_CONNECTION_CLOSED";
      return "MCP_ERROR";
    }
    return networkCodes.includes(code) ? code : "unknown";
  } catch {
    return "unknown";
  }
}
