const failures = new WeakMap();
export function failure(code, details = {}) {
  const messages = {
    INVALID_REQUEST: "Choose a completed UTC day.",
    PROVIDER_UNAVAILABLE: "The data provider could not complete this request.",
    PROVIDER_REFUSED: "The data provider refused this operation.",
    TESTRIL_BINDING_REJECTED: "Testril refused the report binding.",
    PROVIDER_INVALID_RESPONSE:
      "The provider returned data this demo cannot verify.",
    PAYMENT_UNCERTAIN:
      "The payment outcome needs checking. It will not be submitted again automatically.",
    RUN_STOPPED:
      "This run has stopped. Download its evidence before starting another.",
    LIMIT_EXCEEDED: "This purchase would exceed the run's allowance.",
    SCOPE_UNAVAILABLE:
      "Ethereum block boundaries could not be checked. No purchases were submitted.",
    STATE_UNAVAILABLE:
      "The run could not be saved. No further payment will be submitted.",
  };
  if (!Object.hasOwn(messages, code)) throw new Error("Unknown demo failure");
  const error = new Error(messages[code]);
  failures.set(error, { code, details });
  return error;
}
export function describeFailure(error) {
  return (typeof error === "object" && error !== null) ||
    typeof error === "function"
    ? failures.get(error)
    : undefined;
}
