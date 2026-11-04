import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.mjs";
import { fixture } from "./fixture.mjs";

test("server returns the shaped report and the page", async (t) => {
  const recordingPath = join(
    await mkdtemp(join(tmpdir(), "stablecoin-supply-")),
    "report.json",
  );
  await writeFile(recordingPath, JSON.stringify(fixture()));
  const server = createApp(recordingPath);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await (await fetch(`${base}/api/report`)).json();
  assert.equal(report.source, "synthetic");
  assert.equal(report.checks.ok, true);
  assert.equal(report.view.tokens[1].symbol, "USDC");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /Stablecoin Supply/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});
