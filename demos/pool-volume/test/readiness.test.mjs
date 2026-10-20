import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { probeReadiness } from "../src/readiness.mjs";
import { selectOffer } from "../public/payments.js";
import { account, challenge, fakePeers, spec } from "./peers.mjs";

function peers({
  missing = false,
  preparation = challenge(),
  jobs = [],
  broken = false,
} = {}) {
  const calls = [];
  return {
    calls,
    spec,
    testril: async () => ({
      close: async () => calls.push("close"),
      async call(name, args, payment) {
        assert.equal(payment, undefined, "readiness must never send payment");
        calls.push(name);
        if (broken) throw new Error("PRIVATE_ENDPOINT_MUST_NOT_APPEAR");
        if (name === "bind")
          return {
            outcome: "success",
            bound_function_id: `sha256:${"a".repeat(64)}`,
          };
        if (name === "inspect") {
          assert.equal(args.subject, "bound_function");
          return { outcome: "success", active_jobs: jobs };
        }
        if (name === "read")
          return missing
            ? { outcome: "error", kind: "range_unavailable" }
            : challenge("batch-settlement", "23");
        if (name === "materialize") return preparation;
        throw new Error("Unexpected discovery operation");
      },
    }),
    allium: {
      async call(method, path, body, payment) {
        calls.push("allium");
        assert.equal(method, "POST");
        assert.equal(path, "/api/v1/explorer/queries/run-async");
        assert.equal(body.parameters.sql, "SELECT 1 AS value");
        assert.equal(payment, undefined);
        return challenge();
      },
    },
  };
}

test("mainnet discovery with prepared coverage allows a wallet trial without claiming paid verification", async () => {
  const input = peers();
  const result = await probeReadiness(input);
  assert.equal(result.readyForWalletTrial, true);
  assert.equal(result.paidExecutionVerified, false);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(input.calls, ["bind", "inspect", "read", "close", "allium"]);
});

test("Sepolia-only costly preparation reports both blockers and still checks Allium", async () => {
  const preparation = {
    ...challenge("exact", "1661209200", { network: "eip155:84532" }),
    amount: { atoms: "1661209200", usd: "$1661.2092" },
    quote_id: "PRIVATE_QUOTE_ID",
  };
  const result = await probeReadiness(peers({ missing: true, preparation }));
  assert.equal(result.readyForWalletTrial, false);
  assert.ok(result.blockers.some((b) => b.includes("Base mainnet")));
  assert.ok(result.blockers.some((b) => b.includes("$1661.2092")));
  assert.ok(result.providers.allium.sqlSubmission.offers.length);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_QUOTE_ID"));
  assert.ok(!JSON.stringify(result).includes(account.address));
});

test("readiness follows existing preparation without requesting another materialization quote", async () => {
  const input = peers({ missing: true, jobs: ["existing-job"] });
  const result = await probeReadiness(input);
  assert.equal(result.readyForWalletTrial, false);
  assert.ok(!input.calls.includes("materialize"));
  assert.ok(result.blockers.some((b) => b.includes("Wait for existing")));
});

test("a failed Testril probe closes its connection and preserves independent Allium discovery", async () => {
  const input = peers({ broken: true });
  const result = await probeReadiness(input);
  assert.equal(result.readyForWalletTrial, false);
  assert.ok(input.calls.includes("close"));
  assert.ok(result.providers.allium.sqlSubmission.offers.length);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_ENDPOINT"));
});

test("the signer and readiness reject an offer whose amount differs from Testril's quote", async () => {
  const preparation = {
    ...challenge(),
    amount: { atoms: "10001", usd: "$0.010001" },
  };
  assert.throws(() => selectOffer(preparation, "testril"), /quoted charge/);
  const result = await probeReadiness(peers({ missing: true, preparation }));
  assert.ok(result.blockers.some((b) => b.includes("quoted charge")));
});

test("the preflight CLI exits unsuccessfully when HTTP peers advertise unavailable coverage", async (t) => {
  const fake = await fakePeers();
  t.after(fake.close);
  await assert.rejects(
    promisify(execFile)(process.execPath, ["src/preflight.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        TESTRIL_MCP_URL: fake.testrilUrl,
        ALLIUM_URL: fake.alliumUrl,
      },
    }),
    (error) => {
      assert.equal(error.code, 1);
      const result = JSON.parse(error.stdout);
      assert.equal(result.readyForWalletTrial, false);
      assert.equal(result.paidExecutionVerified, false);
      assert.match(result.blockers.join(" "), /coverage/);
      return true;
    },
  );
});
