import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { buildSample, defaultInputs, reference } from "./sample.mjs";
import { verifySample } from "./verify.mjs";
import { discover } from "./mcp.mjs";
import { exportRun, exportSource } from "./archive.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
const staticFiles = new Set([
  "index.html",
  "app.js",
  "amounts.js",
  "style.css",
  "assets/tokens.css",
  "assets/favicon.svg",
  "assets/wordmark.svg",
]);

async function body(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 16000) throw new Error("Request is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON request.");
  }
}

export function createApp({ endpoint = "https://dev.testril.ai/mcp" } = {}) {
  const runs = new Map();
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    response.setHeader("Cache-Control", "no-store");
    const send = (status, result) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    };
    try {
      const host = request.headers.host;
      // Local server only. Reject foreign hosts/origins, including DNS rebinding.
      if (
        !host ||
        !/^127\.0\.0\.1:\d+$/.test(host) ||
        (request.headers.origin &&
          request.headers.origin !== `http://${host}`) ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        return send(403, { error: "Use the local 127.0.0.1 address." });
      const url = new URL(request.url, `http://${host}`);
      if (request.method === "GET" && url.pathname === "/api/config")
        return send(200, {
          inputs: defaultInputs,
          accounts: reference.accounts.map(({ address, label }) => ({
            address,
            label,
          })),
        });
      if (request.method === "POST" && url.pathname === "/api/run") {
        const run = buildSample(await body(request));
        const id = randomUUID();
        if (runs.size >= 50) runs.delete(runs.keys().next().value);
        runs.set(id, run);
        return send(200, { id, run });
      }
      if (request.method === "POST" && url.pathname === "/api/verify") {
        const { id } = await body(request);
        const run = runs.get(id);
        if (!run)
          return send(404, { error: "Run expired. Run the sample again." });
        run.verification = verifySample(run);
        return send(200, run.verification);
      }
      if (request.method === "GET" && url.pathname === "/api/discover")
        return send(200, await discover(endpoint));
      if (request.method === "GET" && url.pathname === "/api/export") {
        const run = runs.get(url.searchParams.get("id"));
        if (!run)
          return send(404, { error: "Run expired. Run the sample again." });
        const archive = await exportRun(run);
        response.writeHead(200, {
          "Content-Type": "application/gzip",
          "Content-Disposition": 'attachment; filename="treasury-run.tar.gz"',
        });
        return response.end(archive);
      }
      if (request.method === "GET" && url.pathname === "/api/source") {
        const archive = await exportSource(root);
        response.writeHead(200, {
          "Content-Type": "application/gzip",
          "Content-Disposition":
            'attachment; filename="treasury-analysis-0.1.0.tar.gz"',
        });
        return response.end(archive);
      }
      const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (request.method === "GET" && staticFiles.has(path)) {
        const content = await readFile(join(root, "public", path));
        response.writeHead(200, {
          "Content-Type": types[path.slice(path.lastIndexOf("."))],
        });
        return response.end(content);
      }
      send(404, { error: "Not found." });
    } catch (error) {
      // Discovery errors must never echo provider URLs, credentials, or response bodies.
      const isDiscovery = request.url === "/api/discover";
      send(isDiscovery ? 502 : 400, {
        error: isDiscovery
          ? "Could not inspect Testril. Check the server's MCP configuration and try again."
          : error.message,
      });
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  const app = createApp({ endpoint: process.env.TESTRIL_MCP_URL });
  app.listen(port, "127.0.0.1", () =>
    console.log(`Treasury sample: http://127.0.0.1:${port}`),
  );
}
