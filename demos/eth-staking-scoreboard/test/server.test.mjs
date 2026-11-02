import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { createApp, report } from "../src/server.mjs";

test("server returns the shaped report and the page", async (t) => {
  const server = createApp();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await (await fetch(`${base}/api/report`)).json();
  assert.equal(report.source, "synthetic");
  assert.equal(report.checks.ok, true);
  assert.equal(report.view.venues[1].symbol, "stVaults");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /ETH Staking Scoreboard/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});

test("report shows the failed cross-check when a day is missing", () => {
  const recording = fixture();
  recording.rows.stmatic.splice(30, 1);
  const result = report(recording);
  assert.equal(result.checks.ok, false);
  assert.match(result.checks.error, /stmatic is missing/);
  assert.equal(result.view, null);
});
