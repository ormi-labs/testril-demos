const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export class VerificationError extends Error {}
const check = (condition, message) => {
  if (!condition) throw new VerificationError(message);
};
const hex = (number) => `0x${number.toString(16)}`;
const identity = (row) => `${row.tx}:${row.log_index}`;
const rowKey = (r) =>
  [r.block, r.log_index, r.tx, r.token, r.from, r.to, r.value].join(":");

export async function digest(chain, blocks) {
  const text = blocks
    .map((b) => `${chain}:${b.number}:${b.block_hash}\n`)
    .join("");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return `sha256:${[...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function rpcClient(url, archive) {
  let nextId = 0;
  return async (calls) => {
    const requests = calls.map((c) => ({ ...c, jsonrpc: "2.0", id: nextId++ }));
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    check(
      response.ok,
      `Ethereum service returned HTTP ${response.status} for ${calls.length} calls (${calls[0].method})`,
    );
    const replies = await response.json();
    check(Array.isArray(replies), "Expected an Ethereum batch response");
    // Keep the header fields used below; omit unrelated transaction lists.
    archive.push({
      requests,
      replies: replies.map((reply) => {
        const request = requests.find((r) => r.id === reply.id);
        const b = reply.result;
        return request?.method === "eth_getBlockByNumber" && b
          ? {
              ...reply,
              result: {
                number: b.number,
                hash: b.hash,
                parentHash: b.parentHash,
                timestamp: b.timestamp,
              },
            }
          : reply;
      }),
    });
    check(replies.length === requests.length, "Incomplete Ethereum response");
    const byId = new Map(replies.map((r) => [r.id, r]));
    check(byId.size === replies.length, "Duplicate Ethereum response IDs");
    return requests.map((r) => {
      const reply = byId.get(r.id);
      check(reply && !reply.error, `${r.method} failed; verification stopped`);
      check(reply.result !== undefined, `${r.method} returned no result`);
      return reply.result;
    });
  };
}

export async function verifyWindow(input, rpc) {
  const { scope, provenance: p, rows: expected } = input;
  const { from_block: from, to_block: to, wallet, token } = scope;
  check(scope.chain_id === 1 && scope.decimals === 6, "Expected Ethereum USDC");
  check(
    Number.isSafeInteger(from) &&
      Number.isSafeInteger(to) &&
      from > 0 &&
      to > from &&
      to - from <= 10000,
    "Bad range",
  );
  check(p.outcome === "success" && !p.orphaned?.length, "Unusable provenance");
  check(
    p.chain_id === scope.chain_id &&
      p.bound_function_id === scope.bound_function_id &&
      p.from_block === from &&
      p.to_block === to,
    "Provenance identifies a different query",
  );
  check(
    p.computation?.id === "erc20.wallet_transfers" &&
      p.computation.version === 1,
    "Unexpected computation",
  );
  check(p.block_count === p.blocks.length, "Incorrect cited block count");
  const cited = new Map();
  for (const b of p.blocks) {
    check(
      b.number >= from && b.number < to,
      "Citation outside requested range",
    );
    check(!cited.has(b.number), "Duplicate cited block");
    cited.set(b.number, b.block_hash);
  }
  const ordered = [...p.blocks].sort((a, b) => a.number - b.number);
  check(
    (await digest(scope.chain_id, ordered)) === p.digest,
    "Provenance digest mismatch",
  );

  const [chain, decimals, finalized] = await rpc([
    { method: "eth_chainId", params: [] },
    {
      method: "eth_call",
      params: [{ to: token, data: "0x313ce567" }, "latest"],
    },
    { method: "eth_getBlockByNumber", params: ["finalized", false] },
  ]);
  check(Number(BigInt(chain)) === scope.chain_id, "Wrong Ethereum network");
  check(Number(BigInt(decimals)) === scope.decimals, "Wrong token decimals");
  check(
    finalized && Number(BigInt(finalized.number)) >= to,
    "Window not finalized",
  );

  // Include uncited blocks: citations alone cannot reveal an omitted transfer.
  const headers = new Map();
  for (let start = from - 1; start <= to; start += 40) {
    const numbers = Array.from(
      { length: Math.min(40, to - start + 1) },
      (_, i) => start + i,
    );
    const batch = await rpc(
      numbers.map((n) => ({
        method: "eth_getBlockByNumber",
        params: [hex(n), false],
      })),
    );
    batch.forEach((b, i) => {
      check(b && Number(BigInt(b.number)) === numbers[i], "Wrong block header");
      headers.set(numbers[i], b);
    });
  }
  for (let n = from; n <= to; n++) {
    check(
      headers.get(n).parentHash === headers.get(n - 1).hash,
      "Broken block chain",
    );
  }
  for (const [n, hash] of cited) {
    check(
      headers.get(n).hash === hash,
      "Cited block hash differs from Ethereum",
    );
  }
  for (const [n, time] of [
    [from, scope.from_time],
    [to, scope.to_time],
  ]) {
    const seconds = Date.parse(time) / 1000;
    check(Number.isFinite(seconds), "Invalid time bound");
    check(
      Number(BigInt(headers.get(n - 1).timestamp)) < seconds &&
        Number(BigInt(headers.get(n).timestamp)) >= seconds,
      "Blocks do not match the requested hour",
    );
  }

  const topic = `0x${wallet.slice(2).padStart(64, "0")}`;
  const actual = new Map();
  for (const topics of [
    [transferTopic, topic],
    [transferTopic, null, topic],
  ]) {
    const [logs] = await rpc([
      {
        method: "eth_getLogs",
        params: [
          {
            address: token,
            fromBlock: hex(from),
            toBlock: hex(to - 1),
            topics,
          },
        ],
      },
    ]);
    check(Array.isArray(logs), "Missing Ethereum logs");
    const seen = new Set();
    for (const log of logs) {
      check(
        !log.removed && log.address.toLowerCase() === token,
        "Wrong source log",
      );
      check(
        log.topics.length === 3 &&
          log.topics[0] === transferTopic &&
          /^0x[0-9a-fA-F]{64}$/.test(log.data),
        "Malformed Transfer event",
      );
      const row = {
        block: Number(BigInt(log.blockNumber)),
        log_index: BigInt(log.logIndex).toString(),
        tx: log.transactionHash.toLowerCase(),
        token,
        from: `0x${log.topics[1].slice(-40)}`.toLowerCase(),
        to: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        value: BigInt(log.data).toString(),
      };
      check(
        row.block >= from && row.block < to,
        "Event outside requested range",
      );
      check(row.from === wallet || row.to === wallet, "Unrelated transfer");
      check(
        log.blockHash === headers.get(row.block).hash,
        "Event on wrong block",
      );
      const id = identity(row),
        previous = actual.get(id);
      check(!seen.has(id), "Duplicate event in one Ethereum response");
      seen.add(id);
      if (previous) {
        check(
          row.from === wallet && row.to === wallet,
          "Unexpected duplicate event",
        );
        check(rowKey(previous) === rowKey(row), "Conflicting self-transfer");
      }
      actual.set(id, row);
    }
  }
  const contributing = [...new Set([...actual.values()].map((r) => r.block))]
    .sort((a, b) => a - b)
    .map((number) => ({ number, block_hash: headers.get(number).hash }));
  check(
    (await digest(scope.chain_id, contributing)) === p.digest,
    "Contributing blocks differ",
  );
  check(actual.size === expected.length, "Transfer count differs from Testril");
  const claimed = new Set();
  for (const row of expected) {
    const id = identity(row);
    check(!claimed.has(id), "Duplicate Testril event");
    claimed.add(id);
    check(
      actual.has(id) && rowKey(actual.get(id)) === rowKey(row),
      "Transfer differs from Testril",
    );
  }
  let incoming = 0n,
    outgoing = 0n;
  const partners = new Map();
  for (const r of actual.values()) {
    if (r.to === wallet) incoming += BigInt(r.value);
    if (r.from === wallet) outgoing += BigInt(r.value);
    const address = r.from === wallet ? r.to : r.from;
    const total = partners.get(address) ?? {
      transfers: 0,
      incoming: 0n,
      outgoing: 0n,
    };
    total.transfers++;
    if (r.to === wallet) total.incoming += BigInt(r.value);
    if (r.from === wallet) total.outgoing += BigInt(r.value);
    partners.set(address, total);
  }
  return {
    from_time: scope.from_time,
    to_time: scope.to_time,
    transfers: actual.size,
    contributing_blocks: contributing.length,
    incoming_atoms: incoming.toString(),
    outgoing_atoms: outgoing.toString(),
    provenance_digest: p.digest,
    exact_match: true,
    counterparties: [...partners]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([address, r]) => ({
        address,
        transfers: r.transfers,
        incoming_atoms: r.incoming.toString(),
        outgoing_atoms: r.outgoing.toString(),
      })),
  };
}

export function replay(archive) {
  const entries = new Map();
  const key = (call) => JSON.stringify([call.method, call.params]);
  for (const batch of archive.batches)
    for (const request of batch.requests) {
      const reply = batch.replies.find((r) => r.id === request.id);
      check(reply && !reply.error, "Incomplete saved evidence");
      entries.set(key(request), reply.result);
    }
  return async (calls) =>
    calls.map((call) => {
      check(
        entries.has(key(call)),
        "This request is absent from the saved evidence",
      );
      return structuredClone(entries.get(key(call)));
    });
}
