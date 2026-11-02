import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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
  assert.equal(report.view.venues[2].name, "Uniswap v4");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /Hooks Across DEXes/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});

test("a recording that fails the cross-check still answers 200 with the failure", async (t) => {
  const recording = fixture();
  recording.rows["cl-pools"].shift();
  const path = join(tmpdir(), `hooks-corrupted-${process.pid}.json`);
  await writeFile(path, JSON.stringify(recording));
  const server = createApp(path);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/report`,
  );
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(report.checks.ok, false);
  assert.match(report.checks.error, /not in its pool list/);
  assert.equal(report.view, null);
});
