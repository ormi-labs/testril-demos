import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateRecording } from "../public/model.js";
import { selectOffer, paymentPlan, signPayment } from "../public/payments.js";
import { createAllium } from "../src/providers.mjs";
import { advance, createRun } from "../src/run.mjs";
import {
  account,
  challenge,
  fakePeers,
  rows,
  spec,
  testWallet,
} from "./peers.mjs";

test("an expired absolute payment deadline is refused before signing", async () => {
  const quote = challenge("exact", "10000", {
    maxTimeoutSeconds: Math.floor(Date.now() / 1000) - 10,
  });
  const accepted = selectOffer(quote, "allium");
  await assert.rejects(
    signPayment(
      testWallet(),
      account.address,
      quote,
      accepted,
      paymentPlan(accepted, [], account.address),
    ),
    /expired/,
  );
});

test("a lost paid response is retained as unconfirmed and cannot be automatically submitted twice", async (t) => {
  const peers = await fakePeers();
  t.after(peers.close);
  let paidAttempts = 0;
  const allium = createAllium(peers.alliumUrl, async (url, options) => {
    if (options.headers["PAYMENT-SIGNATURE"]) {
      paidAttempts++;
      throw new Error("connection lost");
    }
    return fetch(url, options);
  });
  const run = createRun(spec, account.address);
  const quote = await advance(run, "allium", undefined, { allium });
  const payment = await signPayment(
    testWallet(),
    account.address,
    quote.challenge,
    quote.accepted,
    paymentPlan(quote.accepted, [], account.address),
  );
  const state = await advance(run, "allium", payment, { allium });
  assert.equal(state.status, "error");
  assert.equal(state.payments[0].confirmation, "unconfirmed");
  assert.equal(paidAttempts, 1);
  await assert.rejects(
    advance(run, "allium", undefined, { allium }),
    /finished/,
  );
});

test("the recording importer works independently, strips private fields, and refuses overwrites", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pool-volume-import-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of ["src", "public", "recordings"])
    await mkdir(join(directory, folder));
  await copyFile(
    new URL("../src/import-recording.mjs", import.meta.url),
    join(directory, "src/import-recording.mjs"),
  );
  await copyFile(
    new URL("../public/model.js", import.meta.url),
    join(directory, "public/model.js"),
  );
  await writeFile(join(directory, "package.json"), '{"type":"module"}');
  const marker = "DO_NOT_PUBLISH_TEST_MARKER";
  const provider = {
    status: "done",
    rows,
    timing: {
      readMs: 1,
      preparationMs: 0,
      walletWaitMs: 0,
      totalMs: 1,
      signature: marker,
    },
    payments: [
      {
        phase: "read",
        amount: "1",
        depositAmount: "0",
        confirmation: "unconfirmed",
        signature: marker,
      },
    ],
    coverage: {
      materialized: [
        { from_hour: spec.fromHour, to_hour: spec.toHour, signature: marker },
      ],
      activeJobs: [],
    },
    signature: marker,
  };
  const run = {
    schemaVersion: 1,
    kind: "recorded",
    recordedAt: new Date().toISOString(),
    paymentNetwork: "eip155:8453",
    spec,
    providers: { testril: provider, allium: provider },
    privateKey: marker,
  };
  const input = join(directory, "input.json");
  await writeFile(input, JSON.stringify(run));
  const execute = () =>
    promisify(execFile)(process.execPath, [
      join(directory, "src/import-recording.mjs"),
      input,
      "reviewed-run",
    ]);
  await execute();
  const published = await readFile(
    join(directory, "recordings/reviewed-run.json"),
    "utf8",
  );
  assert.ok(!published.includes(marker));
  assert.equal(
    validateRecording(JSON.parse(published)).providers.testril.payments[0]
      .confirmation,
    "unconfirmed",
  );
  await assert.rejects(execute(), /EEXIST/);
});

test("existing paid materialization is followed before buying more preparation", async () => {
  const run = createRun(spec, account.address);
  let done = false;
  const calls = [];
  const peer = {
    async call(name, args) {
      calls.push(name);
      if (name === "bind")
        return {
          outcome: "success",
          bound_function_id: `sha256:${"a".repeat(64)}`,
        };
      if (name === "inspect" && args.subject === "bound_function")
        return { outcome: "success", active_jobs: ["existing-job"] };
      if (name === "inspect") {
        done = true;
        return { outcome: "success", state: "done" };
      }
      if (name === "read")
        return done
          ? { outcome: "success", values: rows }
          : { outcome: "error", kind: "range_unavailable" };
      throw new Error("No preparation purchase expected");
    },
  };
  let result;
  for (let i = 0; i < 10; i++) {
    result = await advance(run, "testril", undefined, { testril: peer });
    if (["done", "error"].includes(result.status)) break;
  }
  assert.equal(result.status, "done", result.error);
  assert.ok(!calls.includes("materialize"));
  assert.deepEqual(result.payments, []);
});

test("batch signing refuses an absent mainnet escrow deployment", async () => {
  const quote = challenge("batch-settlement", "23");
  const accepted = selectOffer(quote, "testril");
  const wallet = testWallet();
  const request = wallet.request;
  wallet.request = (input) =>
    input.method === "eth_getCode" ? "0x" : request(input);
  await assert.rejects(
    signPayment(
      wallet,
      account.address,
      quote,
      accepted,
      paymentPlan(accepted, [], account.address),
    ),
    /not deployed/,
  );
});
