import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createApp } from "../src/server.mjs";
const execute = promisify(execFile);
async function serve(t) {
  const server = createApp();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, input, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
test("sessions isolate state and reject stale mutations, secret inputs and foreign origins", async (t) => {
  const url = await serve(t);
  const state = await (await post(`${url}/api/sessions`, {})).json();
  const route = `${url}/api/sessions/${state.id}`;
  const input = { revision: 0, from: "treasury", to: "a", amount: ".25" };
  const results = await Promise.all([
    post(`${route}/transfer`, input),
    post(`${route}/transfer`, input),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const cached = await (await fetch(route)).json();
  assert.equal(cached.balances.a, "250000");
  assert.equal(cached.payment.spentRaw, "71");
  assert.equal(
    (
      await post(`${route}/transfer`, {
        ...input,
        revision: 1,
        privateKey: "secret",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        `${route}/reset`,
        { revision: 1 },
        { Origin: "https://foreign.example" },
      )
    ).status,
    403,
  );
  assert.equal((await fetch(`${url}/.env`)).status, 404);
  assert.match(
    (await fetch(url)).headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  const second = await (await post(`${url}/api/sessions`, {})).json();
  assert.equal(second.balances.a, "0");
  assert.equal(cached.historyRead.transfers.length, 1);
  const balance = await (
    await fetch(`${route}/balance-provenance?wallet=a`)
  ).json();
  assert.equal(balance.source.balanceRaw, "250000");
  assert.equal(balance.source.blockHash, cached.balanceRead.blockHash);
  assert.equal((await (await fetch(route)).json()).payment.spentRaw, "71");
  const reset = await (
    await post(`${route}/reset`, { revision: cached.revision })
  ).json();
  assert.equal(reset.balances.treasury, "1000000");
  assert.equal(reset.transferCount, 0);
  assert.deepEqual(reset.receipts, []);
  assert.equal(reset.payment.spentRaw, "0");
  assert.equal(reset.payment.remainingRaw, reset.payment.initialRaw);
  assert.deepEqual((await (await fetch(route)).json()).receipts, []);
});
test("run downloads extract and replay using the standalone demo source", async (t) => {
  const url = await serve(t);
  let state = await (await post(`${url}/api/sessions`, {})).json();
  state = await (
    await post(`${url}/api/sessions/${state.id}/transfer`, {
      revision: 0,
      from: "treasury",
      to: "b",
      amount: ".2",
    })
  ).json();
  const directory = await mkdtemp(join(tmpdir(), "wallet-download-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const response = await fetch(`${url}/api/sessions/${state.id}/export`);
  assert.equal(response.status, 200);
  await writeFile(
    join(directory, "run.tar.gz"),
    Buffer.from(await response.arrayBuffer()),
  );
  await execute("tar", ["-xzf", "run.tar.gz"], { cwd: directory });
  const source = join(directory, "treasury-analysis");
  await cp(new URL("../src", import.meta.url), join(source, "src"), {
    recursive: true,
  });
  await cp(new URL("../public", import.meta.url), join(source, "public"), {
    recursive: true,
  });
  await cp(new URL("../fixtures", import.meta.url), join(source, "fixtures"), {
    recursive: true,
  });
  await cp(
    new URL("../package.json", import.meta.url),
    join(source, "package.json"),
  );
  const { stdout } = await execute(
    process.execPath,
    ["src/cli.mjs", "replay", "../run/run.json"],
    { cwd: source },
  );
  assert.match(stdout, /Treasury: 0.8 USDC/);
  assert.match(stdout, /MOCK/);
  assert.match(
    (
      await execute(process.execPath, ["src/cli.mjs", "sample"], {
        cwd: source,
      })
    ).stdout,
    /Treasury: 0.65 USDC/,
  );
});
