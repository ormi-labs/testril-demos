import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  buildSample,
  defaultInputs,
  reference,
  sampleHash,
} from "../src/sample.mjs";
import { calculate } from "../src/accounting.mjs";
import { verifySample, verifyRpc } from "../src/verify.mjs";

test("independent evidence detects altered rows even with a recalculated report", () => {
  const run = buildSample(defaultInputs);
  assert.equal(verifySample(run).status, "passed");
  run.data.edges[0].amountRaw = "90000000";
  run.data.closingRaw = "960000000";
  run.report = calculate(run.inputs, run.data);
  const result = verifySample(run);
  assert.equal(result.status, "failed");
  assert.equal(
    result.checks.find((check) => check.name === "Report arithmetic").passed,
    true,
  );
  assert.equal(
    result.checks.find((check) => check.name === "Transfer rows").passed,
    false,
  );
  assert.equal(
    result.checks.find((check) => check.name === "Balance snapshots").passed,
    false,
  );
});

test("source consistency and arithmetic are separate checks", () => {
  const run = buildSample(defaultInputs);
  run.provenance.blocks[0].hash = `0x${"0".repeat(64)}`;
  assert.equal(
    verifySample(run).checks.find(
      (check) => check.name === "Source block hashes",
    ).passed,
    false,
  );
  run.provenance.blocks.shift();
  assert.throws(() => verifySample(run), /Missing a source/);
  const forged = buildSample(defaultInputs);
  forged.report.netRaw = "0";
  assert.equal(
    verifySample(forged).checks.find(
      (check) => check.name === "Report arithmetic",
    ).passed,
    false,
  );
});

test("synthetic data cannot pass as on-chain verification", async () => {
  await assert.rejects(
    verifyRpc(buildSample(defaultInputs), "http://127.0.0.1:1"),
    /Synthetic runs/,
  );
});

async function fakeRpc(
  t,
  {
    missingLog = false,
    reorg = false,
    wrongChain = false,
    duplicateLog = false,
  } = {},
) {
  const requests = [];
  const blockVisits = new Map();
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    let result;
    if (input.method === "eth_chainId") result = wrongChain ? "0xa4b1" : "0x1";
    else if (input.method === "eth_getBlockByNumber") {
      const block = Number(BigInt(input.params[0]));
      const count = (blockVisits.get(block) ?? 0) + 1;
      blockVisits.set(block, count);
      result = {
        number: input.params[0],
        hash: reorg && count > 1 ? `0x${"a".repeat(64)}` : sampleHash(block),
      };
    } else if (input.method === "eth_getLogs") {
      const logs = reference.logs.map((log, index) => ({
        address: reference.token,
        blockNumber: `0x${log.block.toString(16)}`,
        blockHash: sampleHash(log.block),
        logIndex: `0x${index.toString(16)}`,
        removed: false,
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          `0x${log.from.slice(2).padStart(64, "0")}`,
          `0x${log.to.slice(2).padStart(64, "0")}`,
        ],
        data: `0x${BigInt(log.amountRaw).toString(16).padStart(64, "0")}`,
      }));
      result = missingLog
        ? logs.slice(1)
        : duplicateLog
          ? [...logs, logs[0]]
          : logs;
    } else if (input.method === "eth_call") {
      const opening = input.params[1].blockHash === sampleHash(99);
      const value =
        input.params[0].data === "0x313ce567"
          ? "6"
          : opening
            ? "1000000000"
            : "950000000";
      result = `0x${BigInt(value).toString(16).padStart(64, "0")}`;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

function liveRun() {
  const run = buildSample(defaultInputs);
  run.mode = "live";
  run.provenance.kind = "ethereum";
  return run;
}

test("RPC verifier retrieves token-wide logs and pinned snapshots", async (t) => {
  const { url, requests } = await fakeRpc(t);
  assert.equal((await verifyRpc(liveRun(), url)).status, "passed");
  const filter = requests.find((request) => request.method === "eth_getLogs")
    .params[0];
  assert.equal(filter.fromBlock, "0x64");
  assert.equal(filter.toBlock, "0x44b");
  assert.equal(filter.topics.length, 1);
  const calls = requests.filter(
    (request) =>
      request.method === "eth_call" &&
      request.params[0].data.startsWith("0x70a08231"),
  );
  assert.deepEqual(
    calls.map((call) => call.params[1]),
    [
      { blockHash: sampleHash(99), requireCanonical: true },
      { blockHash: sampleHash(1099), requireCanonical: true },
    ],
  );
});

test("RPC verification checks the decimals used to display amounts", async (t) => {
  const { url } = await fakeRpc(t);
  const run = liveRun();
  run.inputs.decimals = 18;
  assert.equal(
    (await verifyRpc(run, url)).checks.find(
      (check) => check.name === "Token decimals",
    ).passed,
    false,
  );
});

test("RPC verification detects missing events and changing canonical hashes", async (t) => {
  const missing = await fakeRpc(t, { missingLog: true });
  assert.equal(
    (await verifyRpc(liveRun(), missing.url)).checks[0].passed,
    false,
  );
  const changed = await fakeRpc(t, { reorg: true });
  assert.equal(
    (await verifyRpc(liveRun(), changed.url)).checks.find(
      (check) => check.name === "Source block hashes",
    ).passed,
    false,
  );
});

test("RPC verification rejects wrong chains and duplicate event evidence", async (t) => {
  const wrong = await fakeRpc(t, { wrongChain: true });
  await assert.rejects(verifyRpc(liveRun(), wrong.url), /wrong chain/);
  const duplicate = await fakeRpc(t, { duplicateLog: true });
  await assert.rejects(
    verifyRpc(liveRun(), duplicate.url),
    /duplicate Transfer/,
  );
});
