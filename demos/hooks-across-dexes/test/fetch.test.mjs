import { test } from "node:test";
import assert from "node:assert/strict";
import { connectTestril, payerAccount } from "../src/testril.mjs";
import { fetchRows, newRun } from "../src/fetch.mjs";
import { fakeTestril } from "./fake-testril.mjs";

// Public deterministic test key. Never fund this account.
const payerKey = `${"0".repeat(63)}1`;

const binds = [
  {
    name: "usdc-edges",
    function_slug: "erc20.transfer_edges",
    chain_id: 1,
    params: { token_address: `0x${"a".repeat(40)}` },
    window: {
      from_time: "2026-11-01T00:00:00Z",
      to_time: "2026-11-01T02:30:00Z",
    },
    read: { chunk_hours: 1 },
  },
  {
    name: "supply",
    function_slug: "erc20.token_supply",
    chain_id: 1,
    params: { tokens: [`0x${"b".repeat(40)}`], by: "day" },
    window: {
      from_time: "2026-10-02T00:00:00Z",
      to_time: "2026-11-02T00:00:00Z",
    },
  },
  {
    name: "ens-vitalik",
    function_slug: "ens.primary_name",
    chain_id: 1,
    params: { address: `0x${"c".repeat(40)}` },
    window: {
      from_time: "2026-11-01T23:55:00Z",
      to_time: "2026-11-02T00:00:00Z",
    },
  },
];

test("a fetch pays with the payer's vouchers, reports Testril's job progress and keeps every row", async () => {
  const fake = fakeTestril({
    payer: payerAccount(payerKey).address,
    indexed: ["erc20.token_supply"],
    busy: [{ function_slug: "ens.primary_name", job_id: "job:7" }],
  });
  const testril = await connectTestril({
    url: await fake.listen(),
    payerKey,
    name: "fetch-test",
  });
  const run = newRun(binds);
  const seen = [];
  const watched = {
    call: (tool, args) => {
      seen.push({ ...run.binds[0] });
      return testril.call(tool, args);
    },
  };
  let rows;
  try {
    rows = await fetchRows({ binds, testril: watched, run, pollMs: 1 });
  } finally {
    await testril.close();
    await fake.close();
  }

  assert.deepEqual(
    rows["usdc-edges"].map((row) => row.block),
    Array.from({ length: 750 }, (_, i) => 26316189 + i),
  );
  assert.deepEqual(rows.supply, [{ day: "2026-10-02" }]);
  assert.equal(rows["ens-vitalik"].length, 25);

  assert.ok(
    seen.some(
      (p) =>
        p.step === "indexing" &&
        p.done === 375 &&
        p.total === 750 &&
        p.unit === "blocks",
    ),
  );
  assert.deepEqual(
    run.binds.map((p) => [p.name, p.step, p.jobId, p.done, p.total]),
    [
      ["usdc-edges", "done", "job:1", 3, 3],
      ["supply", "done", null, 1, 1],
      ["ens-vitalik", "done", "job:7", 1, 1],
    ],
  );

  const edgeReads = fake.calls.filter(
    (c) =>
      c.paid &&
      c.tool === "read" &&
      c.args.bound_function_id.startsWith("sha256:erc20.transfer_edges"),
  );
  assert.deepEqual(
    edgeReads.map((c) => [c.args.from_time, c.args.to_time]),
    [
      ["2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"],
      ["2026-11-01T01:00:00Z", "2026-11-01T02:00:00Z"],
      ["2026-11-01T02:00:00Z", "2026-11-01T02:30:00Z"],
    ],
  );
  assert.deepEqual(
    fake.charges.map((c) => [c.tool, c.amount]),
    [
      ["materialize", 750 * 120],
      ["read", 20 + 300],
      ["read", 20 + 300],
      ["read", 20 + 150],
      ["read", 20 + 31 * 7200],
      ["read", 20 + 25],
    ],
  );
  assert.equal(
    run.spentAtoms,
    String(750 * 120 + 320 + 320 + 170 + 20 + 31 * 7200 + 45),
  );
});

test("after another job's refusal the window is asked for again before reading", async () => {
  const fake = fakeTestril({
    payer: payerAccount(payerKey).address,
    busy: [
      { function_slug: "ens.primary_name", job_id: "job:7", partial: true },
    ],
  });
  const testril = await connectTestril({
    url: await fake.listen(),
    payerKey,
    name: "fetch-test",
  });
  const bind = { ...binds[2], window: { from_block: 100, to_block: 160 } };
  const run = newRun([bind]);
  let rows;
  try {
    rows = await fetchRows({ binds: [bind], testril, run, pollMs: 1 });
  } finally {
    await testril.close();
    await fake.close();
  }

  assert.equal(rows["ens-vitalik"].length, 60);
  assert.equal(run.binds[0].jobId, "job:2");
  assert.deepEqual(
    fake.charges.map((c) => [c.tool, c.amount]),
    [
      ["materialize", 60 * 120],
      ["read", 20 + 60],
    ],
  );
});
