import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check } from "./check.mjs";
import { binds, shape } from "./report.mjs";
import { fetchRows, newRun } from "./fetch.mjs";
import { connectTestril } from "./testril.mjs";

const demo = "bybit-hack-trail";
const defaultUrl = "https://dev.testril.ai/mcp";
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

export function report(rows) {
  let checks;
  try {
    checks = { ok: true, passed: check({ rows }) };
  } catch (error) {
    checks = { ok: false, error: error.message };
  }
  return { view: shape(rows), checks };
}

export function createApp({
  url = process.env.TESTRIL_MCP_URL ?? defaultUrl,
  payerKey = process.env.TESTRIL_PAYER_KEY,
  pollMs,
} = {}) {
  let run = { state: payerKey ? "idle" : "unconfigured" };

  async function start() {
    run = newRun(binds);
    const current = run;
    let testril;
    try {
      testril = await connectTestril({ url, payerKey, name: demo });
      const rows = await fetchRows({ binds, testril, run: current, pollMs });
      current.report = report(rows);
      current.state = "done";
    } catch (error) {
      current.error = error.message;
      current.state = "failed";
    } finally {
      current.finishedAt = new Date().toISOString();
      await testril?.close().catch(() => {});
    }
  }

  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status, type, body) => {
      response.writeHead(status, { "Content-Type": type });
      response.end(body);
    };
    const json = (status, value) =>
      send(status, "application/json", JSON.stringify(value));
    const { pathname } = new URL(request.url, "http://127.0.0.1");
    try {
      if (pathname === "/api/run") {
        if (request.method === "GET") return json(200, run);
        if (request.method !== "POST") return send(405, "text/plain", "");
        if (run.state === "unconfigured" || run.state === "running")
          return json(409, run);
        start();
        return json(202, run);
      }
      if (request.method !== "GET") return send(405, "text/plain", "");
      const file = normalize(pathname === "/" ? "/index.html" : pathname);
      const type = types[extname(file)];
      if (!type) return send(404, "text/plain", "");
      return send(200, type, await readFile(join(publicDir, file)));
    } catch (error) {
      if (error.code === "ENOENT") return send(404, "text/plain", "");
      json(500, { error: error.message });
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 4180);
  const server = createApp();
  server.listen(port, "127.0.0.1", () =>
    console.info(`http://127.0.0.1:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
}
