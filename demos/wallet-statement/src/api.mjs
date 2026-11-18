import { newRun, publicRun, execute } from "./gateway.mjs";
import { scope } from "../public/model.js";
import { failure, describeFailure } from "./errors.mjs";

async function body(request) {
  if (!request.body) throw failure("INVALID_REQUEST");
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 64000) {
      await reader.cancel();
      throw failure("INVALID_REQUEST");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw failure("INVALID_REQUEST");
  }
}
export const failureStatus = (code) =>
  ({
    INVALID_REQUEST: 400,
    RUN_STOPPED: 409,
    LIMIT_EXCEEDED: 409,
    PAYMENT_UNCERTAIN: 409,
    STATE_UNAVAILABLE: 503,
    SCOPE_UNAVAILABLE: 503,
    PROVIDER_UNAVAILABLE: 503,
    PROVIDER_REFUSED: 503,
    TESTRIL_BINDING_REJECTED: 503,
    PROVIDER_INVALID_RESPONSE: 502,
  })[code] ?? 500;

export function createApi({
  load,
  save,
  providers,
  base = "",
  onError,
  createId,
} = {}) {
  const busy = new Set();
  return async (request) => {
    const respond = (value, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    try {
      const url = new URL(request.url),
        path = url.pathname.slice(base.length);
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== url.origin
      )
        throw failure("INVALID_REQUEST");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw failure("INVALID_REQUEST");
      if (request.method === "POST" && path === "/api/runs") {
        const value = await body(request);
        if (
          !value ||
          !Object.hasOwn(value, "window") ||
          Object.keys(value).some(
            (k) => !["payer", "window", "method"].includes(k),
          )
        )
          throw failure("INVALID_REQUEST");
        const run = newRun(
          value.payer,
          value.window,
          createId?.(request),
          value.method,
        );
        const report = scope(run.window, run.method);
        run.report = Number.isSafeInteger(report.from_block)
          ? report
          : await providers.resolveScope(report);
        await save(run);
        return respond({ id: run.id, scope: run.report }, 201);
      }
      const match = path.match(
        /^\/api\/runs\/([a-f0-9]{8}-[a-f0-9-]{27})(\/step)?$/,
      );
      if (!match) return respond({ error: "Not found." }, 404);
      if (busy.has(match[1]))
        return respond(
          { error: "A request is already in progress.", code: "RUN_STOPPED" },
          409,
        );
      busy.add(match[1]);
      try {
        const run = await load(match[1]);
        if (!run) throw failure("RUN_STOPPED");
        if (request.method === "GET" && !match[2])
          return respond(publicRun(run));
        if (request.method !== "POST" || !match[2])
          throw failure("INVALID_REQUEST");
        return respond(
          await execute(run, await body(request), { providers, persist: save }),
        );
      } finally {
        busy.delete(match[1]);
      }
    } catch (error) {
      if (onError) return onError(error);
      const d = describeFailure(error);
      return respond(
        {
          error: d
            ? error.message
            : "This request could not finish. Check any submitted payment before another run.",
          code: d?.code ?? "UNEXPECTED_FAILURE",
        },
        failureStatus(d?.code),
      );
    }
  };
}
