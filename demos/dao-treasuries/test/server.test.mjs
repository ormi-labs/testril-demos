import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.mjs";
import { fixture } from "./fixture.mjs";

async function recordingsDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "dao-treasuries-"));
  for (const [name, recording] of Object.entries(files))
    await writeFile(join(dir, name), JSON.stringify(recording));
  return dir;
}

test("server returns the shaped report and the page", async (t) => {
  const server = createApp(
    await recordingsDir({ "synthetic.json": fixture() }),
  );
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await (await fetch(`${base}/api/report`)).json();
  assert.equal(report.source, "synthetic");
  assert.equal(report.checks.ok, true);
  assert.equal(report.view.cards[0].holdings[1].symbol, "USDC");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /DAO Treasuries/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});

test("server prefers recorded.json over synthetic.json", async (t) => {
  const recording = fixture();
  const server = createApp(
    await recordingsDir({
      "synthetic.json": recording,
      "recorded.json": { ...recording, source: "dev" },
    }),
  );
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const report = await (
    await fetch(`http://127.0.0.1:${server.address().port}/api/report`)
  ).json();
  assert.equal(report.source, "dev");
});
