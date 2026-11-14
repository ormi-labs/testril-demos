import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { peers, close } from "./peers.mjs";
import { createProviders } from "../src/providers.mjs";
import { createApp, fileStore } from "../src/server.mjs";
const directory = await mkdtemp(join(tmpdir(), "wallet-statement-browser-"));
const p = await peers();
const app = createApp({
  providers: createProviders(p),
  store: fileStore(directory),
});
await new Promise((done) => app.listen(4179, "127.0.0.1", done));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await close(app);
    await p.close();
    await rm(directory, { recursive: true });
  });
