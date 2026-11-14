import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { digest, rpcClient, verifyWindow } from "./verify.mjs";

const load = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const manifest = await load("./input.json");
const archive = await load("./evidence/mevblocker.json");
const cache = new Map();
const key = (r) => JSON.stringify([r.method, r.params]);
for (const batch of archive.batches) {
  for (const request of batch.requests) {
    const reply = batch.replies.find((r) => r.id === request.id);
    cache.set(key(request), reply.result);
  }
}

async function fixture(index = 0) {
  const window = manifest.windows[index];
  const text = await readFile(new URL(window.rows, import.meta.url), "utf8");
  return {
    scope: { ...manifest, ...window },
    provenance: await load(window.provenance),
    rows: text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  };
}

async function replay(calls) {
  return calls.map((call) => {
    assert.ok(cache.has(key(call)), `Missing archived call: ${key(call)}`);
    return structuredClone(cache.get(key(call)));
  });
}

test("reconstruct both complete hours from archived Ethereum responses", async () => {
  for (const [index, count] of [
    [0, 292],
    [1, 503],
  ]) {
    const result = await verifyWindow(await fixture(index), replay);
    assert.equal(result.transfers, count);
    assert.equal(result.exact_match, true);
    assert.deepEqual(result, archive.results[index]);
  }
});

test("published counterparty totals and Nansen transfer listings agree with the reconstruction", async () => {
  // These normalized CSVs contain only fixed provider names, hex IDs and integers.
  const csv = async (path) => {
    const text = await readFile(new URL(path, import.meta.url), "utf8");
    const [fields, ...lines] = text
      .trim()
      .split("\n")
      .map((line) => line.split(","));
    return lines.map((values) =>
      Object.fromEntries(fields.map((f, i) => [f, values[i]])),
    );
  };
  for (const [index, hour] of [
    [0, 12],
    [1, 13],
  ]) {
    const input = await fixture(index);
    const result = await verifyWindow(input, replay);
    const totals = await csv(
      `./data/comparison-hour-${hour}-counterparties.csv`,
    );
    const expected = totals
      .filter((r) => r.provider === "testril")
      .map((r) => ({
        address: r.counterparty,
        transfers: Number(r.transfers),
        incoming_atoms: r.incoming_atoms,
        outgoing_atoms: r.outgoing_atoms,
      }));
    assert.deepEqual(result.counterparties, expected);
    const statement = await csv(`./data/comparison-hour-${hour}-statement.csv`);
    const tuple = (r) => [r.tx, r.from, r.to, r.value].join(":");
    assert.deepEqual(
      statement
        .filter((r) => r.provider === "nansen")
        .map(tuple)
        .sort(),
      input.rows.map(tuple).sort(),
    );
  }
});

test("reject a changed amount, missing transfer and substituted duplicate", async () => {
  const changed = await fixture();
  changed.rows[0].value = (BigInt(changed.rows[0].value) + 1n).toString();
  await assert.rejects(verifyWindow(changed, replay), /Transfer differs/);
  const missing = await fixture();
  missing.rows.pop();
  await assert.rejects(verifyWindow(missing, replay), /Transfer count differs/);
  const duplicate = await fixture();
  duplicate.rows[1] = structuredClone(duplicate.rows[0]);
  await assert.rejects(
    verifyWindow(duplicate, replay),
    /Duplicate Testril event/,
  );
});

test("reject a changed citation even when its digest is recomputed", async () => {
  const input = await fixture();
  input.provenance.blocks[0].block_hash = `0x${"12".repeat(32)}`;
  input.provenance.digest = digest(1, input.provenance.blocks);
  await assert.rejects(verifyWindow(input, replay), /Cited block hash differs/);
});

test("scan the full window and discover an omitted contributing block", async () => {
  const input = await fixture();
  input.provenance.blocks.shift();
  input.provenance.block_count--;
  input.provenance.digest = digest(1, input.provenance.blocks);
  await assert.rejects(
    verifyWindow(input, replay),
    /Contributing blocks differ/,
  );
});

test("reject hour boundaries that disagree with Ethereum timestamps", async () => {
  const input = await fixture();
  input.scope.from_time = "2026-11-10T12:01:00Z";
  await assert.rejects(verifyWindow(input, replay), /requested hour/);
});

test("reject an omitted source event rather than trusting the vendor's rows", async () => {
  let omitted = false;
  const rpc = async (calls) => {
    const replies = await replay(calls);
    if (!omitted && calls[0].method === "eth_getLogs") {
      replies[0].pop();
      omitted = true;
    }
    return replies;
  };
  await assert.rejects(
    verifyWindow(await fixture(), rpc),
    /Contributing blocks differ|Transfer count differs/,
  );
});

test("count a self-transfer once while including its amount in both directions", async () => {
  const input = await fixture();
  const row = input.rows.find(
    (r) => r.from === manifest.wallet && r.to !== manifest.wallet,
  );
  const original = structuredClone(row);
  const originalResult = await verifyWindow(await fixture(), replay);
  row.to = manifest.wallet;
  let selfLog;
  const rpc = async (calls) => {
    const replies = await replay(calls);
    if (calls[0].method === "eth_getLogs") {
      if (calls[0].params[0].topics[1] !== null) {
        selfLog = replies[0].find(
          (l) =>
            l.transactionHash === row.tx &&
            BigInt(l.logIndex).toString() === row.log_index,
        );
        selfLog.topics[2] = `0x${manifest.wallet.slice(2).padStart(64, "0")}`;
      } else replies[0].push(structuredClone(selfLog));
    }
    return replies;
  };
  const result = await verifyWindow(input, rpc);
  assert.equal(result.transfers, 292);
  assert.equal(
    result.incoming_atoms,
    (BigInt(originalResult.incoming_atoms) + BigInt(original.value)).toString(),
  );
  assert.equal(result.outgoing_atoms, originalResult.outgoing_atoms);
});

test("preserve large integers and detect a one-atom error above Number precision", async () => {
  const input = await fixture();
  const row = input.rows[0];
  row.value = ((1n << 100n) + 1n).toString();
  const rpc = async (calls) => {
    const replies = await replay(calls);
    if (calls[0].method === "eth_getLogs") {
      for (const log of replies[0]) {
        if (
          log.transactionHash === row.tx &&
          BigInt(log.logIndex).toString() === row.log_index
        ) {
          log.data = `0x${BigInt(row.value).toString(16).padStart(64, "0")}`;
        }
      }
    }
    return replies;
  };
  const stableRpc = async (calls) => structuredClone(await rpc(calls));
  const captured = new Map();
  const capture = async (calls) => {
    const results = await stableRpc(calls);
    calls.forEach((c, i) => captured.set(key(c), results[i]));
    return results;
  };
  assert.equal((await verifyWindow(input, capture)).exact_match, true);
  row.value = (BigInt(row.value) + 1n).toString();
  await assert.rejects(
    verifyWindow(input, async (calls) =>
      calls.map((c) => structuredClone(captured.get(key(c)))),
    ),
    /Transfer differs/,
  );
});

test("match batch replies by ID and reject incomplete or failed RPC replies", async (t) => {
  let mode = "reverse";
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const replies = JSON.parse(body).map((r) => ({
      jsonrpc: "2.0",
      id: r.id,
      result: r.params[0],
    }));
    if (mode === "reverse") replies.reverse();
    if (mode === "missing") replies.pop();
    if (mode === "error")
      replies[0] = { id: replies[0].id, error: { code: -32000 } };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(replies));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      }),
  );
  const rpc = rpcClient(`http://127.0.0.1:${server.address().port}`, []);
  const calls = ["first", "second"].map((value) => ({
    method: "example",
    params: [value],
  }));
  assert.deepEqual(await rpc(calls), ["first", "second"]);
  mode = "missing";
  await assert.rejects(rpc(calls), /Incomplete/);
  mode = "error";
  await assert.rejects(rpc(calls), /verification stopped/);
});
