import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createApi } from "./api.mjs";
import { createProviders } from "./providers.mjs";
import { failure } from "./errors.mjs";
import { csp } from "./security.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export function fileStore(directory) {
  return {
    async load(id) {
      try {
        return JSON.parse(
          await readFile(resolve(directory, id + ".json"), "utf8"),
        );
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw failure("STATE_UNAVAILABLE");
      }
    },
    async save(run) {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const name = resolve(directory, run.id + ".json");
        await writeFile(name + ".tmp", JSON.stringify(run), { mode: 0o600 });
        await rename(name + ".tmp", name);
      } catch {
        throw failure("STATE_UNAVAILABLE");
      }
    },
  };
}
export function createApp({
  providers = createProviders({
    testrilUrl: process.env.TESTRIL_MCP_URL,
    nansenUrl: process.env.NANSEN_URL,
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
  }),
  store = fileStore(resolve(root, "runtime")),
} = {}) {
  const api = createApi({ ...store, providers });
  return createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host;
      if (!/^127\.0\.0\.1:\d+$/.test(host ?? "")) {
        outgoing.writeHead(403);
        outgoing.end("Use 127.0.0.1.");
        return;
      }
      const url = new URL(incoming.url, `http://${host}`);
      const request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        ...(!["GET", "HEAD"].includes(incoming.method)
          ? { body: Readable.toWeb(incoming), duplex: "half" }
          : {}),
      });
      let response;
      if (url.pathname.startsWith("/api/")) response = await api(request);
      else {
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        if (
          !/^(?:\/(?:index\.html|style\.css|source\.zip)|\/build\/app\.js|\/assets\/[a-z-]+\.svg|\/recordings\/hour-1[23]\.json|\/verification\/(?:evidence\.json|source\.zip))$/.test(
            path,
          )
        )
          response = new Response("Not found", { status: 404 });
        else {
          const content = await readFile(resolve(root, "public", "." + path));
          const extension = path.split(".").at(-1);
          response = new Response(content, {
            headers: {
              "content-type": {
                html: "text/html; charset=utf-8",
                css: "text/css",
                js: "text/javascript",
                json: "application/json",
                svg: "image/svg+xml",
                zip: "application/zip",
              }[extension],
            },
          });
        }
      }
      response.headers.set("Content-Security-Policy", csp);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(
        JSON.stringify({
          error:
            "The request failed. Retain the current run before trying again.",
        }),
      );
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const server = createApp();
  server.listen(Number(process.env.PORT ?? 4178), "127.0.0.1", () =>
    console.info(`Pool Flows: http://127.0.0.1:${process.env.PORT ?? 4178}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
}
