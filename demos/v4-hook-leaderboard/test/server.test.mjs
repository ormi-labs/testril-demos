import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../src/server.mjs";
import { payerAccount } from "../src/testril.mjs";
import { fakeTestril } from "./fake-testril.mjs";
import { fixtureRows } from "./fixture.mjs";

// Public deterministic test key. Never fund this account.
const payerKey = `${"0".repeat(63)}1`;

async function listen(server, t) {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test("without a payer key the page cannot start a fetch", async (t) => {
  const base = await listen(createApp({ payerKey: "" }), t);
  assert.equal(
    (await (await fetch(`${base}/api/run`)).json()).state,
    "unconfigured",
  );
  assert.equal(
    (await fetch(`${base}/api/run`, { method: "POST" })).status,
    409,
  );
});

test("the button's fetch ends in the shaped report and its passed cross-check", async (t) => {
  const fake = fakeTestril({
    payer: payerAccount(payerKey).address,
    rows: fixtureRows(),
  });
  t.after(() => fake.close());
  const base = await listen(
    createApp({ url: await fake.listen(), payerKey, pollMs: 1 }),
    t,
  );
  assert.equal(
    (await fetch(`${base}/api/run`, { method: "POST" })).status,
    202,
  );
  let run;
  do {
    await delay(20);
    run = await (await fetch(`${base}/api/run`)).json();
  } while (run.state === "running");
  assert.equal(run.state, "done", run.error);
  assert.equal(run.report.checks.ok, true);
  assert.ok(run.report.view.hooks.some((hook) => hook.label === "Arrakis"));
  assert.ok(BigInt(run.spentAtoms) > 0n);

  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  const html = await page.text();
  assert.match(html, /Fetch from Testril/);
  assert.match(html, /V4 Hook Leaderboard/);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});
