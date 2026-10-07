const keys = ["prepare", "broadcast", "confirm", "materialize", "pay", "read"];

function category(name) {
  if (name === "RPC transaction preparation and signing") return "prepare";
  if (name === "RPC broadcast") return "broadcast";
  if (name === "RPC receipt wait and block verification") return "confirm";
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
  const phases = { rpc: {}, testril: {} };
  const steps = Object.fromEntries(
    keys.map((key) => [key, { active: 0, started: false, complete: false }]),
  );
  return {
    async track(name, operation) {
      const key = category(name);
      const step = steps[key];
      if (!step || outcome !== "running") return operation();
      const rpc = ["prepare", "broadcast", "confirm"].includes(key);
      if (rpc) phases.rpc.start ??= performance.now();
      step.started = true;
      step.active++;
      try {
        const result = await operation();
        if (rpc) step.complete = true;
        return result;
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
      phases.rpc.end = performance.now();
      phases.rpc.complete = true;
    },
    refreshing() {
      phases.testril.start = performance.now();
    },
    finish(result) {
      outcome = result;
      for (const phase of Object.values(phases)) {
        if (phase.start !== undefined) phase.end ??= performance.now();
      }
      phases.testril.complete = result === "success";
    },
    snapshot() {
      return {
        revision,
        outcome,
        phases: Object.fromEntries(
          Object.entries(phases).map(([key, phase]) => [
            key,
            {
              started: phase.start !== undefined,
              complete: !!phase.complete,
              elapsedMs:
                phase.start === undefined
                  ? 0
                  : (phase.end ?? performance.now()) - phase.start,
            },
          ]),
        ),
        steps: Object.fromEntries(keys.map((key) => [key, { ...steps[key] }])),
      };
    },
  };
}
