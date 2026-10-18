import { createApp } from "../src/server.mjs";
import { fakePeers, close } from "./peers.mjs";

const peers = await fakePeers();
const server = createApp({
  env: {
    LIVE_ENABLED: "true",
    TESTRIL_MCP_URL: peers.testrilUrl,
    ALLIUM_URL: peers.alliumUrl,
  },
});
await new Promise((resolve) => server.listen(4177, "127.0.0.1", resolve));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await close(server);
    await peers.close();
  });
