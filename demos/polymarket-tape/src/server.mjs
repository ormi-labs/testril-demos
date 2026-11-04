import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check, shape } from "./report.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

export function report(recording) {
  let checks;
  try {
    checks = { ok: true, passed: check(recording.rows) };
  } catch (error) {
    checks = { ok: false, error: error.message };
  }
  return {
    source: recording.source,
    recordedAt: recording.recordedAt,
    view: shape(recording.rows),
    checks,
  };
}

async function readRecording(directory) {
  try {
    return JSON.parse(await readFile(join(directory, "recorded.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return JSON.parse(
      await readFile(join(directory, "synthetic.json"), "utf8"),
    );
  }
}

export function createApp(recordingsDir = join(root, "recordings")) {
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
    const { pathname } = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method !== "GET") return send(405, "text/plain", "");
      if (pathname === "/api/report") {
        const recording = await readRecording(recordingsDir);
        return send(200, "application/json", JSON.stringify(report(recording)));
      }
      const file = normalize(pathname === "/" ? "/index.html" : pathname);
      const type = types[extname(file)];
      if (!type || file.includes("..")) return send(404, "text/plain", "");
      return send(200, type, await readFile(join(publicDir, file)));
    } catch (error) {
      if (error.code === "ENOENT") return send(404, "text/plain", "");
      send(500, "application/json", JSON.stringify({ error: error.message }));
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
