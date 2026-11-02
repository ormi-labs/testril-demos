import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.mjs";

test("server returns the shaped report and the page", async (t) => {
  const server = createApp();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = await (await fetch(`${base}/api/report`)).json();
  assert.equal(report.source, "synthetic");
  assert.equal(report.checks.ok, true);
  assert.equal(report.view.venues[2].title, "Tessera · Base");
  const page = await fetch(base);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /New Venue Flow/);
  assert.equal((await fetch(`${base}/../testril.json`)).status, 404);
});
