import { test } from "node:test";
import assert from "node:assert/strict";
import { connectTestril, payerAccount } from "../src/testril.mjs";
import { record } from "../src/record.mjs";
import { fakeTestril } from "./fake-testril.mjs";

// Public deterministic test key. Never fund this account.
const payerKey = `${"0".repeat(63)}1`;

const spec = {
  demo: "pons-graduations",
  binds: [
    {
      name: "usdc-edges",
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
    {
      name: "ens-vitalik",
      function_slug: "ens.primary_name",
      chain_id: 1,
      params: { address: `0x${"c".repeat(40)}` },
      window: { from_block: 249, to_block: 250 },
    },
  ],
};

async function recordAgainst(fake) {
  const testril = await connectTestril({
    url: await fake.listen(),
    payerKey,
    name: spec.demo,
  });
  try {
    return await record({ spec, testril, log: () => {}, pollMs: 1 });
  } finally {
    await testril.close();
    await fake.close();
  }
}

test("record pays with the payer's vouchers, follows each materialize answer and keeps every row", async () => {
  const fake = fakeTestril({
    payer: payerAccount(payerKey).address,
    indexed: ["sha256:erc20.token_supply"],
    busy: [{ id: "sha256:ens.primary_name", job_id: "job:7" }],
  });
  const recording = await recordAgainst(fake);

  assert.equal(recording.source, "dev");
  assert.deepEqual(
    recording.rows["usdc-edges"].map((row) => row.block),
    Array.from({ length: 150 }, (_, i) => 100 + i),
  );
  assert.deepEqual(recording.rows.supply, [{ day: "2026-10-02" }]);
  assert.deepEqual(recording.rows["ens-vitalik"], [{ block: 249 }]);

  const edgeReads = fake.calls.filter(
    (c) =>
      c.paid &&
      c.tool === "read" &&
      c.args.bound_function_id === "sha256:erc20.transfer_edges",
  );
  assert.deepEqual(
    edgeReads.map((c) => [c.args.from_block, c.args.to_block]),
    [
      [100, 200],
      [200, 250],
    ],
  );
  assert.equal(recording.boundFunctions["usdc-edges"].job_id, "job:1");
  assert.equal(recording.boundFunctions.supply.job_id, null);
  assert.equal(recording.boundFunctions["ens-vitalik"].job_id, "job:7");

  assert.deepEqual(
    fake.charges.map((c) => [c.tool, c.amount]),
    [
      ["materialize", 150 * 120],
      ["read", 120],
      ["read", 70],
      ["read", 7220],
      ["read", 21],
    ],
  );
  assert.equal(recording.spentAtoms, String(150 * 120 + 120 + 70 + 7220 + 21));
});
