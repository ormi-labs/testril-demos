import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectTestril } from "../testril.mjs";
import { createOperator } from "../operator.mjs";
import { plan, record } from "../prepare.mjs";
import { fakeTestril, operatorKey } from "./fake-testril.mjs";

const spec = {
  demo: "fake-demo",
  binds: [
    {
      name: "edges",
      function_slug: "erc20.transfer_edges",
      chain_id: 1,
      params: { token_address: `0x${"a".repeat(40)}` },
      window: { from_block: 100, to_block: 250 },
      read: { chunk_blocks: 100 },
    },
    {
      name: "supply",
      function_slug: "erc20.token_supply",
      chain_id: 1,
      params: { tokens: [`0x${"b".repeat(40)}`], by: "day" },
      window: { from_day: "2026-10-02", to_day: "2026-11-02" },
    },
  ],
};

async function demoDir(binds = spec.binds) {
  const dir = await mkdtemp(join(tmpdir(), "prepare-"));
  await mkdir(join(dir, "recordings"));
  await writeFile(
    join(dir, "testril.json"),
    JSON.stringify({ ...spec, binds }),
  );
  await writeFile(
    join(dir, "recordings", "report.json"),
    JSON.stringify({ source: "synthetic", rows: { edges: [{ block: 1 }] } }),
  );
  return dir;
}

async function session(t, options) {
  const fake = fakeTestril(options);
  const testril = await connectTestril(await fake.listen());
  t.after(async () => {
    await testril.close();
    await fake.close();
  });
  return { fake, testril };
}

const quiet = { log: () => {}, pollMs: 1 };

test("plan counts blocks and credits per bind without binding", async (t) => {
  const { fake, testril } = await session(t);
  const waiting = { ...spec.binds[1], name: "arb", chain_id: 42161 };
  const rows = await plan({ binds: [...spec.binds, waiting] }, testril);
  assert.deepEqual(
    rows.map((r) => [r.name, r.served, r.blocks, r.atoms]),
    [
      ["edges", true, 150, 18000n],
      ["supply", true, 223200, 26784000n],
      ["arb", false, 9956890, 1194826800n],
    ],
  );
  assert.deepEqual([...new Set(fake.calls.map((c) => c.name))], ["inspect"]);
});

test("record pays with usage credits, reads in chunks and writes a dev report", async (t) => {
  const { fake, testril } = await session(t, {
    credits: 100_000_000n,
    channel: { balance: "0", chargedCumulativeAmount: "5000" },
  });
  const dir = await demoDir();
  const operator = createOperator(operatorKey);
  await record(dir, { testril, operator, ...quiet });
  const report = JSON.parse(
    await readFile(join(dir, "recordings", "report.json"), "utf8"),
  );
  assert.equal(report.source, "dev");
  assert.deepEqual(
    report.rows.edges.map((r) => r.block),
    Array.from({ length: 150 }, (_, i) => 100 + i),
  );
  assert.deepEqual(report.rows.supply, [{ day: "2026-10-02" }]);
  assert.deepEqual(report.boundFunctions.edges.jobs, ["job:1"]);
  assert.deepEqual(
    fake.calls
      .filter((c) => c.name === "read" && c.paid)
      .map((c) => [c.args.from_block, c.args.to_block]),
    [
      [100, 200],
      [200, 250],
      [undefined, undefined],
    ],
  );
  const charged = 150 * 120 + 7200 * 120 + (20 + 100) + (20 + 50) + (20 + 7200);
  assert.equal(fake.usageCredits.charged, BigInt(charged));
  assert.equal(
    fake.channel.chargedCumulativeAmount,
    "5000",
    "usage credits leave the channel's charged total where it was",
  );

  await record(dir, { testril, operator, ...quiet });
  assert.equal(
    fake.calls.filter((c) => c.name === "materialize").length,
    4,
    "a second run reuses the materialized windows",
  );
});

test("record stops when neither usage credits nor a channel cover the charge", async (t) => {
  const { fake, testril } = await session(t, { credits: 100n });
  const dir = await demoDir();
  await assert.rejects(
    record(dir, { testril, operator: createOperator(operatorKey), ...quiet }),
    /did not confirm payment/,
  );
  assert.equal(fake.usageCredits.charged, 0n);
  const report = JSON.parse(
    await readFile(join(dir, "recordings", "report.json"), "utf8"),
  );
  assert.equal(report.source, "synthetic");
});

test("--max-jobs leaves binds that need more jobs for the next run", async (t) => {
  const { fake, testril } = await session(t, { credits: 100_000_000n });
  const dir = await demoDir();
  const { pending } = await record(dir, {
    testril,
    operator: createOperator(operatorKey),
    maxJobs: 1,
    only: undefined,
    ...quiet,
  });
  assert.deepEqual(pending, ["supply"]);
  assert.equal(fake.calls.filter((c) => c.name === "materialize").length, 2);
});
