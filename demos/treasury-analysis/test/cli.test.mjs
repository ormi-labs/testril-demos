import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDemo, exportDemo } from "../src/demo.mjs";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("replay rejects missing, extra, or invalid cached wallet balances before printing", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "treasury-replay-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, "run.json");
  const sample = exportDemo(createDemo());
  const live = {
    ...sample,
    mode: "live",
    formatVersion: 3,
    actualBalances: { ...sample.balances },
  };
  const incomplete = { treasury: "1000000", a: "0" };
  const extra = { ...sample.balances, unknown: "0" };
  const invalid = { ...sample.balances, b: "-1" };
  for (const run of [
    { ...sample, balances: extra },
    { ...live, balances: incomplete, actualBalances: incomplete },
    { ...live, balances: extra, actualBalances: extra },
    { ...live, balances: invalid, actualBalances: invalid },
    { ...live, wallets: [...live.wallets, live.wallets[0]] },
  ]) {
    await writeFile(filename, JSON.stringify(run));
    await assert.rejects(
      execute(process.execPath, [cli, "replay", filename]),
      (error) => {
        assert.equal(error.code, 1);
        assert.equal(error.stdout, "");
        assert.match(error.stderr, /Export balances disagree|unsigned decimal/);
        return true;
      },
    );
  }
  await writeFile(filename, JSON.stringify(live));
  const { stdout } = await execute(process.execPath, [cli, "replay", filename]);
  assert.match(stdout, /latest cached Testril wallet balances/);
  assert.match(stdout, /Treasury: 1 USDC/);
  assert.match(stdout, /Counterparty B: 0 USDC/);
});
