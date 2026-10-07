import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  access,
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { livePeer } from "./live-peer.mjs";

test(
  "Ctrl-C through npm releases the live lock and keeps saved state",
  {
    skip: process.platform === "win32",
    timeout: 20000,
  },
  async (t) => {
    const peer = await livePeer(t);
    const root = fileURLToPath(new URL("..", import.meta.url));
    const directory = await mkdtemp(join(tmpdir(), "demo-shutdown-"));
    for (const name of ["src", "public", "fixtures"])
      await cp(join(root, name), join(directory, name), { recursive: true });
    await copyFile(join(root, "package.json"), join(directory, "package.json"));
    await copyFile(
      join(peer.directory, ".live-state.json"),
      join(directory, ".live-state.json"),
    );
    await symlink(
      join(root, "node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const child = spawn("npm", ["start"], {
      cwd: directory,
      detached: true,
      env: {
        ...process.env,
        ...peer.env,
        TESTRIL_MCP_URL: peer.config.mcpUrl,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    t.after(async () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      await exited;
      await rm(directory, { recursive: true, force: true });
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    while (!output.includes("Wallet transfers:"))
      await once(child.stdout, "data", { signal: AbortSignal.timeout(10000) });
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "live" }),
    });
    assert.equal(response.status, 201, output);
    const lock = join(directory, ".live-lock");
    const owner = Number(await readFile(join(lock, "pid"), "utf8"));
    assert.notEqual(owner, process.pid);
    const saved = await readFile(join(directory, ".live-state.json"), "utf8");
    // A terminal sends Ctrl-C to the whole foreground group, including npm and Node.
    process.kill(-child.pid, "SIGINT");
    await exited;
    assert.throws(() => process.kill(owner, 0), { code: "ESRCH" });
    await assert.rejects(access(lock), { code: "ENOENT" });
    assert.equal(
      await readFile(join(directory, ".live-state.json"), "utf8"),
      saved,
    );
  },
);
