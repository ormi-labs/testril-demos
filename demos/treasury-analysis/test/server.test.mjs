import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createApp } from "../src/server.mjs";
import { defaultInputs } from "../src/sample.mjs";
import { discover } from "../src/mcp.mjs";

const execute = promisify(execFile);
async function serve(t, server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, data, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });

test("server rejects foreign origins/hosts, secret files and invalid scopes", async (t) => {
  const url = await serve(t, createApp());
  assert.equal(
    (
      await post(`${url}/api/run`, defaultInputs, {
        Origin: "https://foreign.example",
      })
    ).status,
    403,
  );
  const foreignStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      { headers: { Host: "foreign.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(foreignStatus, 403);
  assert.equal((await fetch(`${url}/.env`)).status, 404);
  assert.equal(
    (await post(`${url}/api/run`, { ...defaultInputs, toBlock: 99 })).status,
    400,
  );
  assert.match(
    (await fetch(url)).headers.get("content-security-policy"),
    /script-src 'self'/,
  );
});

test("export retains completed verification and source runs outside the repository", async (t) => {
  const url = await serve(t, createApp());
  const { id } = await (await post(`${url}/api/run`, defaultInputs)).json();
  assert.equal(
    (await (await post(`${url}/api/verify`, { id })).json()).status,
    "passed",
  );
  const directory = await mkdtemp(join(tmpdir(), "treasury-extract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [route, filename] of [
    [`/api/export?id=${id}`, "run.tar.gz"],
    ["/api/source", "source.tar.gz"],
  ]) {
    const response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200);
    await writeFile(
      join(directory, filename),
      Buffer.from(await response.arrayBuffer()),
    );
    await execute("tar", ["-xzf", filename], { cwd: directory });
  }
  const run = JSON.parse(
    await readFile(join(directory, "run/run.json"), "utf8"),
  );
  assert.equal(run.verification.status, "passed");
  assert.equal(run.receipts.paidRaw, "0");
  const sourcePath = join(directory, "treasury-analysis");
  const manifest = JSON.parse(
    await readFile(join(sourcePath, "SOURCE.json"), "utf8"),
  );
  assert.equal(manifest.version, "0.1.0");
  assert.equal(
    manifest.files["README.md"],
    createHash("sha256")
      .update(await readFile(join(sourcePath, "README.md")))
      .digest("hex"),
  );
  const { stdout } = await execute(
    process.execPath,
    ["src/cli.mjs", "sample"],
    { cwd: sourcePath },
  );
  assert.match(stdout, /950 USDC/);
  const verified = await execute(
    process.execPath,
    ["src/cli.mjs", "verify", "../run/run.json"],
    { cwd: sourcePath },
  );
  assert.match(verified.stdout, /"status": "passed"/);
  await assert.rejects(readFile(join(sourcePath, ".env")), /ENOENT/);
  await assert.rejects(
    readFile(join(sourcePath, "node_modules/package.json")),
    /ENOENT/,
  );
  assert.equal(
    JSON.parse(await readFile(join(sourcePath, "package-lock.json"), "utf8"))
      .name,
    "testril-treasury-analysis",
  );
});

test("MCP discovery supports SSE/session handling and issues only free inspect calls", async (t) => {
  const methods = [];
  let deleted = false;
  const server = createServer(async (request, response) => {
    if (request.method === "DELETE") {
      deleted = request.headers["mcp-session-id"] === "test-session";
      response.writeHead(204);
      response.end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    methods.push(message);
    if (message.method === "initialize") {
      response.setHeader("mcp-session-id", "test-session");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: message.id,
          result: { protocolVersion: "2024-11-05" },
        }),
      );
      return;
    }
    assert.equal(request.headers["mcp-session-id"], "test-session");
    if (!message.id) {
      response.writeHead(202);
      response.end();
      return;
    }
    response.setHeader("content-type", "text/event-stream");
    response.end(
      `event: message\ndata: ${JSON.stringify({ id: message.id, result: { content: [{ type: "text", text: JSON.stringify({ outcome: "success", functions: [{ function_slug: "erc20.token_balance" }] }) }] } })}\n\n`,
    );
  });
  const result = await discover(await serve(t, server));
  assert.equal(
    result.catalog.functions[0].function_slug,
    "erc20.token_balance",
  );
  assert.equal(deleted, true);
  assert.deepEqual(
    methods
      .filter((message) => message.method === "tools/call")
      .map((message) => message.params.name),
    ["inspect"],
  );
});

test("discovery failures never echo provider credentials to the browser", async (t) => {
  const url = await serve(
    t,
    createApp({ endpoint: "http://secret:private-token@127.0.0.1:1" }),
  );
  const response = await fetch(`${url}/api/discover`);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret|private-token/);
});
