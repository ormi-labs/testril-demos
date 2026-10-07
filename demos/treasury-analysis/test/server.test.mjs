import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { livePeer } from "./live-peer.mjs";
import { createApp } from "../src/server.mjs";
const execute = promisify(execFile);
async function serve(t, options) {
  const server = createApp(options);
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

test("INFO logs include the measured transfer stages and browser click-to-refresh duration", async (t) => {
  const peer = await livePeer(t);
  const messages = [];
  const url = await serve(t, {
    env: peer.env,
    liveFactory: async () => peer.demo,
    info: (message) => messages.push(message),
  });
  const state = await (
    await post(`${url}/api/sessions`, { mode: "live" })
  ).json();
  const route = `${url}/api/sessions/${state.id}`;
  const ready = await (await post(`${route}/refresh`, {})).json();
  const response = await post(`${route}/transfer`, {
    revision: ready.revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  assert.equal(response.status, 200);
  const { timing } = await response.json();
  assert.equal(timing.outcome, "success");
  assert.match(messages[0], /\[INFO\] Send server operation/);
  assert.match(messages[0], /RPC receipt wait and block verification/);
  assert.match(messages[0], /Testril materialize Treasury execute/);
  assert.match(messages[0], /Testril read transfer edges execute/);
  assert.match(messages[0], /detail times overlap; not additive/);
  const report = { id: timing.id, elapsedMs: timing.elapsedMs + 50 };
  assert.equal(
    (await post(`${url}/api/timings`, { ...report, payload: "never log this" }))
      .status,
    400,
  );
  assert.equal(
    (await post(`${url}/api/timings`, { ...report, elapsedMs: "invalid" }))
      .status,
    400,
  );
  assert.equal((await post(`${url}/api/timings`, report)).status, 200);
  assert.match(messages[1], /Send click → refreshed UI/);
  assert.match(messages[1], /Browser, local HTTP and rendering: 0.050s/);
  assert.equal((await post(`${url}/api/timings`, report)).status, 404);
  assert.ok(!messages.join("\n").includes("payload"));
  for (const key of Object.values(peer.env).filter((v) =>
    /^0x[0-9a-f]{64}$/.test(v),
  ))
    assert.ok(!messages.join("\n").includes(key));
});

test("live source dialogs fetch provenance on demand without charging for metadata", async (t) => {
  const peer = await livePeer(t);
  const url = await serve(t, {
    env: peer.env,
    liveFactory: async () => peer.demo,
    info: () => {},
  });
  const state = await (
    await post(`${url}/api/sessions`, { mode: "live" })
  ).json();
  const route = `${url}/api/sessions/${state.id}`;
  const ready = await (await post(`${route}/refresh`, {})).json();
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 0);
  const proof = await (
    await fetch(`${route}/balance-provenance?wallet=a`)
  ).json();
  assert.equal(proof.source.balanceRaw, "500000");
  assert.equal(proof.function.version, 1);
  const result = await (
    await post(`${route}/transfer`, {
      revision: ready.revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    })
  ).json();
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 1);
  const transfer = result.historyRead.transfers[0];
  const edge = await (
    await fetch(`${route}/provenance?transfer=${transfer.id}`)
  ).json();
  assert.equal(edge.source.transactionHash, transfer.transactionHash);
  assert.equal(edge.citation.computation.version, 1);
  assert.equal(peer.calls.filter((c) => c.name === "provenance").length, 2);
  assert.equal(peer.demo.state().payment.spentRaw, result.payment.spentRaw);
  assert.equal(
    (await fetch(`${route}/balance-provenance?wallet=unknown`)).status,
    400,
  );
});

test("live progress reports actual overlapping work without adding Testril calls", async (t) => {
  let paused = false;
  const gates = new Map();
  for (const key of [
    "transfer",
    "broadcast",
    "confirm",
    "pay",
    "materialize",
    "read",
  ]) {
    let entered;
    let release;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    gates.set(key, { entered, release, started, ready, arrivals: 0 });
  }
  t.after(() => {
    for (const gate of gates.values()) gate.release();
  });
  const peer = await livePeer(t, {
    async beforeTool(name, args) {
      if (!paused) return;
      const key =
        name === "pay_quote"
          ? "pay"
          : name === "materialize" && args.payment_id
            ? "materialize"
            : name === "read" && args.payment_id
              ? "read"
              : undefined;
      const gate = gates.get(key);
      if (gate) {
        gate.arrivals++;
        if (key !== "read" || gate.arrivals === 3) gate.entered();
        await gate.ready;
      }
    },
  });
  const prepare = peer.chain.prepare;
  peer.chain.prepare = async (...args) => {
    if (paused) {
      const gate = gates.get("transfer");
      gate.entered();
      await gate.ready;
    }
    return prepare(...args);
  };
  for (const key of ["broadcast", "confirm"]) {
    const operation = peer.chain[key];
    peer.chain[key] = async (...args) => {
      if (paused) {
        const gate = gates.get(key);
        gate.entered();
        await gate.ready;
      }
      return operation(...args);
    };
  }
  const url = await serve(t, {
    env: peer.env,
    liveFactory: async () => peer.demo,
    info: () => {},
  });
  const state = await (
    await post(`${url}/api/sessions`, { mode: "live" })
  ).json();
  const route = `${url}/api/sessions/${state.id}`;
  const progress = async () => (await fetch(`${route}/progress`)).json();
  assert.equal(await progress(), null);
  const ready = await (await post(`${route}/refresh`, {})).json();
  paused = true;
  const response = post(`${route}/transfer`, {
    revision: ready.revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  await gates.get("transfer").started;
  const first = await progress();
  assert.equal(first.revision, ready.revision);
  assert.equal(first.outcome, "running");
  assert.equal(first.steps.prepare.active, 1);
  assert.equal(first.phases.rpc.started, true);
  assert.equal(first.phases.rpc.complete, false);
  assert.equal(first.phases.testril.started, false);
  assert.equal(first.steps.pay.started, false);
  gates.get("transfer").release();
  await gates.get("broadcast").started;
  const submitting = await progress();
  assert.equal(submitting.steps.prepare.complete, true);
  assert.equal(submitting.steps.broadcast.active, 1);
  assert.equal(submitting.steps.confirm.started, false);
  gates.get("broadcast").release();
  await gates.get("confirm").started;
  const confirming = await progress();
  assert.equal(confirming.steps.broadcast.complete, true);
  assert.equal(confirming.steps.confirm.active, 1);
  assert.equal(confirming.phases.testril.started, false);
  assert.ok(confirming.phases.rpc.elapsedMs >= first.phases.rpc.elapsedMs);
  gates.get("confirm").release();
  await gates.get("pay").started;
  const transferred = await progress();
  assert.equal(transferred.steps.confirm.complete, true);
  assert.equal(transferred.phases.rpc.complete, true);
  assert.equal(transferred.phases.testril.started, true);
  const rpcTime = transferred.phases.rpc.elapsedMs;
  assert.equal((await progress()).steps.pay.active, 1);
  gates.get("pay").release();
  await gates.get("materialize").started;
  assert.ok((await progress()).steps.materialize.active >= 1);
  gates.get("materialize").release();
  await gates.get("read").started;
  const reading = await progress();
  assert.equal(reading.steps.read.active, 3);
  assert.equal(reading.phases.rpc.elapsedMs, rpcTime);
  assert.ok(
    reading.phases.testril.elapsedMs > transferred.phases.testril.elapsedMs,
  );
  assert.equal(reading.steps.materialize.complete, true);
  assert.equal(reading.steps.pay.complete, true);
  const calls = peer.calls.length;
  await progress();
  await progress();
  await progress();
  assert.equal(peer.calls.length, calls);
  gates.get("read").release();
  const result = await (await response).json();
  assert.equal(result.timing.outcome, "success");
  const final = await progress();
  assert.equal(final.outcome, "success");
  assert.equal(final.phases.rpc.elapsedMs, rpcTime);
  assert.equal(final.phases.testril.complete, true);
  assert.ok(final.phases.testril.elapsedMs > reading.phases.testril.elapsedMs);
  assert.ok(
    final.phases.rpc.elapsedMs + final.phases.testril.elapsedMs <=
      result.timing.elapsedMs,
  );
  assert.ok(
    Object.values(final.steps).every((s) => s.complete && s.active === 0),
  );
  assert.equal(peer.demo.export().progress, undefined);
  assert.equal(peer.demo.state().progress, undefined);
});
