import { failure, describeFailure } from "./errors.mjs";

// Find the first Ethereum block at or after each UTC boundary. This is a free
// node lookup, performed before requesting any paid data or signatures.
export async function resolveDay(report, { url, fetcher = fetch }) {
  const cache = new Map();
  let requestId = 0;
  const deadline = Date.now() + 30000;
  async function rpc(method, params) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Day lookup timed out");
    const id = requestId++;
    const response = await fetcher(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(15000, remaining)),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) throw new Error("Node unavailable");
    const value = await response.json();
    if (value.id !== id || value.error || value.result === undefined)
      throw new Error("Invalid node response");
    return value.result;
  }
  async function block(tag) {
    if (!cache.has(tag))
      cache.set(
        tag,
        (async () => {
          const b = await rpc("eth_getBlockByNumber", [tag, false]);
          if (
            !/^0x[0-9a-f]+$/i.test(b?.number) ||
            !/^0x[0-9a-f]+$/i.test(b?.timestamp)
          )
            throw new Error("Invalid block");
          const result = {
            number: Number(BigInt(b.number)),
            timestamp: Number(BigInt(b.timestamp)),
          };
          if (
            !Number.isSafeInteger(result.number) ||
            !Number.isSafeInteger(result.timestamp) ||
            result.number < 0 ||
            result.timestamp < 0 ||
            (tag !== "finalized" && result.number !== Number(BigInt(tag)))
          )
            throw new Error("Unexpected block");
          return result;
        })(),
      );
    return cache.get(tag);
  }
  try {
    if ((await rpc("eth_chainId", [])) !== "0x1")
      throw new Error("Wrong network");
    const head = await block("finalized");
    const from = Date.parse(report.from_time) / 1000,
      to = Date.parse(report.to_time) / 1000;
    if (to > head.timestamp) throw failure("SCOPE_UNAVAILABLE");
    async function firstAt(timestamp) {
      let low = 0,
        high = head.number;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const b = await block(`0x${mid.toString(16)}`);
        if (b.timestamp < timestamp) low = mid + 1;
        else high = mid;
      }
      const b = await block(`0x${low.toString(16)}`);
      const previous = low ? await block(`0x${(low - 1).toString(16)}`) : null;
      if (
        b.timestamp < timestamp ||
        !previous ||
        previous.timestamp >= timestamp
      )
        throw new Error("Unverified boundary");
      return low;
    }
    const [from_block, to_block] = await Promise.all([
      firstAt(from),
      firstAt(to),
    ]);
    if (to_block <= from_block || to_block - from_block > 10000)
      throw failure("INVALID_REQUEST");
    return { ...report, from_block, to_block };
  } catch (error) {
    if (describeFailure(error)) throw error;
    throw failure("SCOPE_UNAVAILABLE");
  }
}
