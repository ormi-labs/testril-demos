import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createFileJournal(directory) {
  const lock = join(directory, ".live-lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try {
      owner = Number(await readFile(join(lock, "pid"), "utf8"));
    } catch {
      // Older lock directories did not record an owner.
    }
    if (Number.isSafeInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0);
      } catch (error) {
        if (error.code === "ESRCH")
          throw new Error(
            `Previous live server (PID ${owner}) has stopped. Remove the stale .live-lock directory and retry; keep .live-state.json.`,
          );
      }
      throw new Error(
        `Live server PID ${owner} holds .live-lock. Stop that server before starting live mode.`,
      );
    }
    throw new Error(
      "The .live-lock directory has no owner record. After checking that all demo servers have stopped, remove only .live-lock and retry; keep .live-state.json.",
    );
  }
  const path = join(directory, ".live-state.json");
  try {
    await writeFile(join(lock, "pid"), `${process.pid}\n`, { mode: 0o600 });
  } catch (error) {
    await rm(lock, { recursive: true });
    throw error;
  }
  return {
    async load() {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
    async save(contents) {
      await writeFile(`${path}.tmp`, contents, { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    },
    close: () => rm(lock, { recursive: true }),
  };
}
