import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  reportSpec,
  chargeCap,
  depositCap,
  paymentNetwork,
  validateRecording,
} from "../public/model.js";
import { alliumSql, connectTestril, createAllium } from "./providers.mjs";
import { advance, createRun } from "./run.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/build/app.js", ["build/app.js", "text/javascript"]],
  ["/assets/wordmark.svg", ["assets/wordmark.svg", "image/svg+xml"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
]);

async function requestBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 32000) throw new Error("The request is too large.");
  }
  return JSON.parse(text);
}

export async function loadRecordings(directory = join(root, "recordings")) {
  const files = (await readdir(directory))
    .filter((name) => /^[a-z0-9-]+\.json$/.test(name))
    .sort();
  return Promise.all(
    files.map(async (name) => {
      const text = await readFile(join(directory, name), "utf8");
      if (text.length > 1000000) throw new Error("A recording is too large.");
      return {
        id: name.slice(0, -5),
        run: validateRecording(JSON.parse(text)),
      };
    }),
  );
}

export function createApp({
  env = process.env,
  testrilFactory = () =>
    connectTestril(env.TESTRIL_MCP_URL ?? "https://dev.testril.ai/mcp"),
  allium = createAllium(env.ALLIUM_URL ?? "https://agents.allium.so"),
  recordings = [],
} = {}) {
  const spec = reportSpec(env.REPORT_FROM_HOUR);
  const enabled = env.LIVE_ENABLED === "true";
  const runs = new Map();
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    try {
      const host = request.headers.host;
      if (
        !/^127\.0\.0\.1:\d+$/.test(host ?? "") ||
        (request.headers.origin &&
          request.headers.origin !== `http://${host}`) ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        return send(403, { error: "Use the local 127.0.0.1 address." });
      const url = new URL(request.url, `http://${host}`);
      if (request.method === "GET" && url.pathname === "/api/config")
        return send(200, {
          spec,
          paymentNetwork,
          chargeCap,
          depositCap,
          liveEnabled: enabled,
          liveReason: enabled
            ? null
            : "Fresh runs await Base mainnet settlement and verification of accountless Allium SQL results.",
          sql: alliumSql(spec),
        });
      if (request.method === "GET" && url.pathname === "/api/recordings")
        return send(200, recordings);
      if (request.method === "POST" && url.pathname === "/api/runs") {
        if (!enabled)
          return send(409, { error: "Fresh paid runs are not enabled." });
        const input = await requestBody(request);
        if (
          !input ||
          Object.keys(input).some((k) => k !== "wallet") ||
          !/^0x[0-9a-fA-F]{40}$/.test(input.wallet)
        )
          throw new Error("Connect a wallet to create a run.");
        for (const [id, run] of runs)
          if (!run.busy && Date.now() - run.createdAt > 600000) {
            await run.peer?.close();
            runs.delete(id);
          }
        if (runs.size >= 100)
          return send(429, { error: "Too many active runs. Try again later." });
        const run = createRun(spec, input.wallet);
        runs.set(run.id, run);
        return send(201, { id: run.id });
      }
      const match = url.pathname.match(/^\/api\/runs\/([a-f0-9-]{36})\/step$/);
      if (request.method === "POST" && match) {
        const run = runs.get(match[1]);
        if (!run)
          return send(404, { error: "The run was not found or expired." });
        const input = await requestBody(request);
        if (
          !input ||
          Object.keys(input).some(
            (k) => !["provider", "payment"].includes(k),
          ) ||
          !["testril", "allium"].includes(input.provider)
        )
          throw new Error("Choose Testril or Allium.");
        // A connection promise also serializes concurrent initialization.
        if (input.provider === "testril") {
          run.connection ??= Promise.resolve().then(testrilFactory);
          run.peer = await run.connection;
        }
        return send(
          200,
          await advance(run, input.provider, input.payment, {
            testril: run.peer,
            allium,
          }),
        );
      }
      if (request.method === "GET" && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        const content = await readFile(join(root, "public", file));
        response.writeHead(200, { "Content-Type": type });
        return response.end(content);
      }
      send(404, { error: "Not found." });
    } catch {
      // Transport errors and request bodies can contain signed payment material.
      send(400, {
        error:
          "The request failed. If a payment was submitted, reconcile it before starting again.",
      });
    }
  });
  server.on("close", () => {
    for (const run of runs.values()) void run.peer?.close();
  });
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createApp({ recordings: await loadRecordings() });
  const port = Number(process.env.PORT ?? 4176);
  server.listen(port, "127.0.0.1", () =>
    console.info(`Pool Volume: http://127.0.0.1:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
}
