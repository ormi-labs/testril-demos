import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.mjs";
import { fixture } from "./fixture.mjs";

test("server returns the shaped report and the page", async (t) => {
  const server = createApp();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await (await fetch(`${base}/api/report`)).json();
  assert.equal(report.source, "synthetic");
  assert.equal(report.checks.ok, true);
  assert.equal(report.view.feeds[1].name, "BTC / USD");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /Oracle vs Pool/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});

test("a recording with a missing hour reports a failed check, not an error", async (t) => {
  const recording = fixture();
  recording.rows.feeds.splice(10, 1);
  const path = join(await mkdtemp(join(tmpdir(), "oracle-vs-pool-")), "r.json");
  await writeFile(path, JSON.stringify(recording));
  const server = createApp(path);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/report`,
  );
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.checks.ok, false);
  assert.match(report.checks.error, /ETH \/ USD feed is missing/);
});
