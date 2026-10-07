import { randomUUID } from "node:crypto";

export function createTransferTiming() {
  const id = randomUUID();
  const started = performance.now();
  const stages = [];
  const local = { name: "Other local work", elapsedMs: 0, details: [] };
  let current = local;
  return {
    startWork() {
      stages.push({
        name: "Queue wait",
        elapsedMs: performance.now() - started,
        details: [],
      });
    },
    async stage(name, operation) {
      const stage = { name, elapsedMs: 0, details: [] };
      stages.push(stage);
      const previous = current;
      current = stage;
      const start = performance.now();
      try {
        return await operation();
      } finally {
        stage.elapsedMs = performance.now() - start;
        current = previous;
      }
    },
    async measure(name, operation) {
      const stage = current;
      const start = performance.now();
      try {
        return await operation();
      } finally {
        let detail = stage.details.find((d) => d.name === name);
        if (!detail) {
          detail = { name, calls: 0, elapsedMs: 0 };
          stage.details.push(detail);
        }
        detail.calls++;
        detail.elapsedMs += performance.now() - start;
      }
    },
    finish(outcome) {
      const elapsedMs = performance.now() - started;
      local.elapsedMs = Math.max(
        0,
        elapsedMs - stages.reduce((sum, s) => sum + s.elapsedMs, 0),
      );
      return { id, outcome, elapsedMs, stages: [...stages, local] };
    },
  };
}
