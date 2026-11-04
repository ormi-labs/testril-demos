import { createApp } from "../src/server.mjs";
import { payerAccount } from "../src/testril.mjs";
import { fakeTestril } from "./fake-testril.mjs";
import { fixtureRows } from "./fixture.mjs";

// Public deterministic test key. Never fund this account.
const payerKey = `${"0".repeat(63)}1`;
const fake = fakeTestril({
  payer: payerAccount(payerKey).address,
  rows: fixtureRows(),
});
const app = createApp({ url: await fake.listen(), payerKey, pollMs: 50 });
app.listen(Number(process.env.PORT), "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    app.close();
    app.closeAllConnections();
    await fake.close();
  });
