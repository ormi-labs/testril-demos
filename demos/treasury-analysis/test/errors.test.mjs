import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  demoFailure,
  describeFailure,
  failureMessage,
} from "../src/errors.mjs";
import { createLiveDemo } from "../src/live-demo.mjs";
import { createApp } from "../src/server.mjs";
import { livePeer, testConfig } from "./live-peer.mjs";

test("only demo-owned failures are described, without reading unknown exceptions or causes", () => {
  const real = demoFailure("TRANSFER_PENDING", "Wait for confirmation.");
  const forged = Object.assign(new Error("provider secret"), {
    code: "TRANSFER_PENDING",
    status: 503,
    cause: real,
  });
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("Do not read me");
      },
    },
  );
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  for (const unknown of [
    undefined,
    null,
    true,
    3,
    "secret",
    Symbol(),
    forged,
    hostile,
    proxy,
    new Proxy(real, {}),
  ]) {
    assert.equal(describeFailure(unknown), undefined);
    assert.doesNotMatch(failureMessage(unknown), /provider secret/);
  }
  const before = describeFailure(real);
  real.message = "Reworded explanation.";
  real.code = "forged-code";
  assert.deepEqual(describeFailure(real), before);
  before.details.injected = "provider secret";
  before.code = "CHANGED";
  assert.deepEqual(describeFailure(real), {
    code: "TRANSFER_PENDING",
    details: {},
  });
  assert.throws(
    () =>
      demoFailure("TESTRIL_BINDING_REJECTED", "invalid", {
        functionSlug: "https://private-provider.example/secret",
        reason: "invalid_params",
      }),
    /Invalid demo failure descriptor/,
  );
});

for (const [slug, wallet] of [
  ["erc20.transfer_edges", undefined],
  ["erc20.token_balance", "treasury"],
])
  test(`a refused ${slug} binding exposes structured context without a payment`, async (t) => {
    const peer = await livePeer(t, { refuseBinding: slug });
    await assert.rejects(peer.demo.refresh(), (error) => {
      assert.deepEqual(describeFailure(error), {
        code: "TESTRIL_BINDING_REJECTED",
        details: {
          functionSlug: slug,
          ...(wallet && { walletId: wallet }),
          reason: "invalid_params",
        },
      });
      assert.equal(error.cause, undefined);
      assert.match(error.message, /test\/fixtures/);
      return true;
    });
    assert.equal(
      peer.calls.some((call) => call.payment),
      false,
    );
    assert.equal(peer.prepares, 0);
  });

test("a failed binding transport preserves its classification and never suggests a schema refusal", async (t) => {
  const secret =
    "https://private-provider.example/secret signed-transaction-body";
  const peer = await livePeer(t, {
    beforeTool(name, args) {
      if (name === "bind" && args.function_slug === "erc20.token_balance")
        throw new Error(secret);
    },
  });
  await assert.rejects(peer.demo.refresh(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "TESTRIL_REQUEST_FAILED",
      details: {
        operation: "bind",
        transportCode: "unknown",
        functionSlug: "erc20.token_balance",
        walletId: "treasury",
      },
    });
    assert.doesNotMatch(
      error.message,
      /private-provider|signed-transaction|schema|test\/fixtures/,
    );
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(
    peer.calls.some((call) => call.payment),
    false,
  );
});

test("unknown refusal reasons are neutral and malformed binding successes fail before reading", async (t) => {
  for (const [reply, expected] of [
    [
      { outcome: "error", kind: "credential-bearing-provider-message" },
      {
        code: "TESTRIL_BINDING_REJECTED",
        details: { functionSlug: "erc20.transfer_edges", reason: "unknown" },
      },
    ],
    [
      { outcome: "success" },
      {
        code: "TESTRIL_RESPONSE_INVALID",
        details: { operation: "bind", functionSlug: "erc20.transfer_edges" },
      },
    ],
  ]) {
    const peer = await livePeer(t, { bindingResponse: () => reply });
    await assert.rejects(peer.demo.refresh(), (error) => {
      assert.deepEqual(describeFailure(error), expected);
      assert.doesNotMatch(error.message, /credential-bearing/);
      return true;
    });
    assert.equal(
      peer.calls.some((call) => ["read", "materialize"].includes(call.name)),
      false,
    );
    assert.equal(
      peer.calls.some((call) => call.payment),
      false,
    );
  }
});

test("a frozen sponsor refusal propagates unchanged before any payment is sent", async (t) => {
  const policy = Object.freeze(new Error("host-private sponsor policy"));
  const peer = await livePeer(t, {
    authorizePayment: async () => {
      throw policy;
    },
  });
  await assert.rejects(peer.demo.refresh(), (error) => error === policy);
  assert.equal(describeFailure(policy), undefined);
  assert.equal(
    peer.calls.some((call) => call.payment),
    false,
  );
  assert.equal(peer.demo.export().allReceipts.length, 0);
});

test("a frozen transaction authorization refusal survives timing and leaves no pending transaction", async (t) => {
  const peer = await livePeer(t);
  await peer.demo.refresh();
  const policy = Object.freeze(new Error("host-private transaction policy"));
  peer.chain.prepare = async () => {
    throw policy;
  };
  await assert.rejects(
    peer.demo.transfer({
      revision: peer.demo.state().revision,
      from: "treasury",
      to: "a",
      amount: ".25",
    }),
    (error) => error === policy,
  );
  assert.equal(describeFailure(policy), undefined);
  assert.equal(peer.demo.state().pending, null);
  assert.equal(peer.prepares, 0);
  assert.equal(peer.demo.progress().outcome, "failed");
});

for (const corrupted of [false, true])
  test(`journal ${corrupted ? "corruption" : "load failure"} preserves its classification even when cleanup fails`, async () => {
    const closed = [];
    await assert.rejects(
      createLiveDemo({
        config: testConfig().config,
        chain: {},
        mcp: {
          close() {
            closed.push("mcp");
            throw new Error("cleanup secret");
          },
        },
        journal: {
          load() {
            if (corrupted) return "invalid json secret";
            throw new Error("storage path secret");
          },
          close() {
            closed.push("journal");
            throw new Error("cleanup secret");
          },
        },
      }),
      (error) => {
        assert.deepEqual(
          describeFailure(error),
          corrupted
            ? { code: "JOURNAL_INVALID", details: {} }
            : { code: "JOURNAL_UNAVAILABLE", details: { operation: "load" } },
        );
        assert.doesNotMatch(error.message, /secret/);
        return true;
      },
    );
    assert.deepEqual(closed.sort(), ["journal", "mcp"]);
  });

test("journal cleanup failure is structured and still closes the provider connection", async () => {
  let closed = false;
  const demo = await createLiveDemo({
    config: testConfig().config,
    chain: {},
    mcp: {
      close: async () => {
        closed = true;
      },
    },
    journal: {
      load: async () => {},
      save: async () => {},
      close: async () => {
        throw new Error("storage secret");
      },
    },
  });
  await assert.rejects(demo.close(), (error) => {
    assert.deepEqual(describeFailure(error), {
      code: "JOURNAL_UNAVAILABLE",
      details: { operation: "close" },
    });
    assert.doesNotMatch(error.message, /storage secret/);
    return true;
  });
  assert.equal(closed, true);
});

async function serve(t, peer, info = () => {}) {
  const server = createApp({
    env: peer.env,
    liveFactory: async () => peer.demo,
    info,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, input) => {
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return { status: response.status, value: await response.json() };
  };
  const { value } = await post("/api/sessions", { mode: "live" });
  return {
    post: (action, input = {}) =>
      post(`/api/sessions/${value.id}/${action}`, input),
  };
}

test("the standalone HTTP boundary exposes domain codes and owns its HTTP status mapping", async (t) => {
  const peer = await livePeer(t);
  const api = await serve(t, peer);
  const { value: ready } = await api.post("refresh");
  const stale = await api.post("transfer", {
    revision: ready.revision - 1,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.value.code, "STALE_REVISION");
  const invalid = await api.post("transfer", {
    revision: ready.revision,
    from: "treasury",
    to: "a",
    amount: "0",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.value.code, "INVALID_AMOUNT");
  assert.equal(peer.prepares, 0);
});

test("the standalone HTTP boundary does not expose arbitrary embedding-policy messages", async (t) => {
  const peer = await livePeer(t, {
    authorizePayment: async () => {
      throw Object.assign(new Error("private policy secret"), {
        code: "TESTRIL_BINDING_REJECTED",
      });
    },
  });
  const api = await serve(t, peer);
  const failed = await api.post("refresh");
  assert.equal(failed.value.code, undefined);
  assert.doesNotMatch(
    JSON.stringify(failed.value),
    /private policy|secret|TESTRIL_BINDING_REJECTED/,
  );
  assert.equal(
    peer.calls.some((call) => call.payment),
    false,
  );
});

test("an unknown policy exception cannot supply timing data to local logs or responses", async (t) => {
  const peer = await livePeer(t);
  const messages = [];
  const api = await serve(t, peer, (message) => messages.push(message));
  const { value: ready } = await api.post("refresh");
  let timingReads = 0;
  const policy = Object.freeze(
    Object.defineProperty(new Error("private policy"), "timing", {
      get() {
        timingReads++;
        throw new Error("private timing data");
      },
    }),
  );
  peer.chain.prepare = async () => {
    throw policy;
  };
  const refused = await api.post("transfer", {
    revision: ready.revision,
    from: "treasury",
    to: "a",
    amount: ".25",
  });
  assert.equal(
    refused.value.error,
    "Live operation failed. Inspect the saved state and refresh.",
  );
  assert.equal(refused.value.timing, undefined);
  assert.equal(timingReads, 0);
  assert.deepEqual(messages, []);
  assert.doesNotMatch(JSON.stringify(refused.value), /private/);
});
