import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  createDemo,
  transferDemo,
  resetDemo,
  showTransfers,
  publicState,
  provenanceFor,
  exportDemo,
} from "./demo.mjs";
import { exportRun, exportSource } from "./archive.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
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
  "replay.js",
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

export function createApp() {
  const sessions = new Map();
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
      if (
        !host ||
        !/^127\.0\.0\.1:\d+$/.test(host) ||
        (request.headers.origin &&
          request.headers.origin !== `http://${host}`) ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        return send(403, { error: "Use the local 127.0.0.1 address." });
      const url = new URL(request.url, `http://${host}`);
      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const input = await body(request);
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).length
        )
          throw new Error("Session creation requires an empty object.");
        const demo = createDemo();
        if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
        sessions.set(demo.id, demo);
        return send(201, publicState(demo));
      }
      if (request.method === "GET" && url.pathname === "/api/source") {
        const archive = await exportSource(root);
        response.writeHead(200, {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="treasury-analysis-${version}.tar.gz"`,
        });
        return response.end(archive);
      }
      const match = url.pathname.match(
        /^\/api\/sessions\/([a-f0-9-]+)(?:\/(transfer|reset|history|export|provenance))?$/,
      );
      if (match) {
        const [, id, action] = match;
        let demo = sessions.get(id);
        if (!demo)
          return send(404, {
            error: "Mock session expired. Reload to start again.",
          });
        if (request.method === "GET" && !action)
          return send(200, publicState(demo));
        if (request.method === "GET" && action === "provenance")
          return send(
            200,
            provenanceFor(demo, url.searchParams.get("transfer")),
          );
        if (request.method === "GET" && action === "export") {
          const archive = await exportRun(exportDemo(demo));
          response.writeHead(200, {
            "Content-Type": "application/gzip",
            "Content-Disposition":
              'attachment; filename="wallet-transfers-run.tar.gz"',
          });
          return response.end(archive);
        }
        if (
          request.method === "POST" &&
          ["transfer", "reset", "history"].includes(action)
        ) {
          const input = await body(request);
          demo = sessions.get(id);
          if (!demo)
            return send(404, {
              error: "Mock session expired. Reload to start again.",
            });
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error("Invalid request.");
          const allowed =
            action === "transfer"
              ? ["revision", "from", "to", "amount"]
              : ["revision"];
          if (Object.keys(input).some((key) => !allowed.includes(key)))
            throw new Error("Unexpected input fields.");
          if (input.revision !== demo.revision)
            return send(409, {
              error:
                "This view is out of date. The latest balances are now shown; try again.",
              state: publicState(demo),
            });
          if (action === "history") {
            const { demo: updated, history } = showTransfers(demo);
            sessions.set(id, updated);
            return send(200, { state: publicState(updated), history });
          }
          const updated =
            action === "transfer" ? transferDemo(demo, input) : resetDemo(demo);
          sessions.set(id, updated);
          return send(200, publicState(updated));
        }
      }
      const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (request.method === "GET" && staticFiles.has(path)) {
        response.writeHead(200, {
          "Content-Type": types[path.slice(path.lastIndexOf("."))],
        });
        return response.end(await readFile(join(root, "public", path)));
      }
      send(404, { error: "Not found." });
    } catch (error) {
      send(400, { error: error.message });
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
  createApp().listen(port, "127.0.0.1", () =>
    console.log(`Wallet transfers mock: http://127.0.0.1:${port}`),
  );
}
