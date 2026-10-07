const keys = ["transfer", "materialize", "pay", "read"];

function category(name) {
  if (name.startsWith("RPC ")) return "transfer";
  if (name.startsWith("Testril read ")) return "read";
  if (
    name.startsWith("Testril materialize ") ||
    name === "Testril inspect job" ||
    name === "Materialization polling sleep"
  )
    return "materialize";
  if (
    name === "Testril pay_quote" ||
    name === "Testril inspect channels" ||
    name === "Sign Testril payment"
  )
    return "pay";
}

// Local activity only: no amounts, signatures, RPC responses, or paid reads.
export function createTransferProgress(revision) {
  let outcome = "running";
  let resources = new Map();
  const steps = Object.fromEntries(
    keys.map((key) => [key, { active: 0, started: false, complete: false }]),
  );
  return {
    async track(name, operation) {
      const step = steps[category(name)];
      if (!step || outcome !== "running") return operation();
      step.started = true;
      step.active++;
      try {
        return await operation();
      } finally {
        step.active--;
      }
    },
    expectReads(windows) {
      if (outcome !== "running") return;
      resources = new Map(
        windows.map((window) => [JSON.stringify(window), {}]),
      );
    },
    readPhase(id, block, phase) {
      const resource = resources.get(JSON.stringify([id, block]));
      if (!resource || outcome !== "running") return;
      resource.materialize = true;
      if (phase === "paid" || phase === "done") resource.pay = true;
      if (phase === "done") resource.read = true;
      for (const key of ["materialize", "pay", "read"])
        steps[key].complete = [...resources.values()].every((r) => r[key]);
    },
    transferred() {
      steps.transfer.complete = true;
    },
    finish(result) {
      outcome = result;
    },
    snapshot() {
      return {
        revision,
        outcome,
        steps: Object.fromEntries(keys.map((key) => [key, { ...steps[key] }])),
      };
    },
  };
}
