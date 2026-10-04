import { isDeepStrictEqual } from "node:util";
import { aggregateLogs, calculate, calculationVersion } from "./accounting.mjs";
import { reference, sampleHash } from "./sample.mjs";

const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hashPattern = /^0x[0-9a-f]{64}$/;
const hex = (value) => `0x${value.toString(16)}`;
const sorted = (edges) =>
  [...edges].sort((a, b) =>
    `${a.block}:${a.from}:${a.to}`.localeCompare(
      `${b.block}:${b.from}:${b.to}`,
    ),
  );

function compare(run, evidence, description) {
  const recalculated = calculate(run.inputs, run.data);
  const checks = [
    {
      name: "Transfer rows",
      passed: isDeepStrictEqual(sorted(run.data.edges), sorted(evidence.edges)),
    },
    {
      name: "Balance snapshots",
      passed:
        run.data.openingRaw === evidence.openingRaw &&
        run.data.closingRaw === evidence.closingRaw,
    },
    { name: "Source block hashes", passed: evidence.hashesMatch },
    { name: "Token decimals", passed: evidence.decimalsMatch },
    {
      name: "Report arithmetic",
      passed:
        run.calculation.version === calculationVersion &&
        isDeepStrictEqual(run.report, recalculated) &&
        recalculated.reconciles,
    },
  ];
  return {
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    reference: description,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

function validateRun(run) {
  if (!run || run.formatVersion !== 1 || !["sample", "live"].includes(run.mode))
    throw new Error("Unsupported run format or mode.");
  calculate(run.inputs, run.data);
  if (!Array.isArray(run.provenance?.blocks) || !run.calculation)
    throw new Error("Missing calculation or source references.");
  const sources = new Map();
  for (const source of run.provenance.blocks) {
    if (
      !Number.isSafeInteger(source.block) ||
      source.block < run.inputs.fromBlock - 1 ||
      source.block >= run.inputs.toBlock ||
      !hashPattern.test(source.hash) ||
      sources.has(source.block)
    )
      throw new Error("Invalid or duplicate source block reference.");
    sources.set(source.block, source.hash);
  }
  for (const block of [
    run.inputs.fromBlock - 1,
    run.inputs.toBlock - 1,
    ...run.data.edges.map((edge) => edge.block),
  ]) {
    if (!sources.has(block))
      throw new Error("Missing a source block hash for an edge or snapshot.");
  }
  return sources;
}

export function verifySample(run) {
  const sources = validateRun(run);
  if (run.mode !== "sample" || run.provenance.kind !== "synthetic")
    throw new Error("Use a reference RPC to verify live data.");
  if (
    run.inputs.chainId !== reference.chainId ||
    run.inputs.token !== reference.token ||
    run.inputs.decimals !== reference.decimals ||
    run.inputs.fromBlock < 100 ||
    run.inputs.toBlock > 1100
  )
    throw new Error("Run is outside the synthetic fixture.");
  const logs = reference.logs.filter(
    (log) =>
      log.block >= run.inputs.fromBlock && log.block < run.inputs.toBlock,
  );
  // Derive state from independent events, not the report provider's snapshots.
  function balanceFromEvents(block) {
    const account = reference.accounts.find(
      (account) => account.address === run.inputs.treasury,
    );
    if (!account) throw new Error("Unknown sample treasury.");
    let balance = BigInt(account.openingRaw);
    for (const event of reference.logs.filter(
      (event) => event.block <= block,
    )) {
      if (event.from === account.address) balance -= BigInt(event.amountRaw);
      if (event.to === account.address) balance += BigInt(event.amountRaw);
    }
    return balance.toString();
  }
  return compare(
    run,
    {
      edges: aggregateLogs(logs),
      openingRaw: balanceFromEvents(run.inputs.fromBlock - 1),
      closingRaw: balanceFromEvents(run.inputs.toBlock - 1),
      hashesMatch: [...sources].every(
        ([block, hash]) => sampleHash(block) === hash,
      ),
      decimalsMatch: run.inputs.decimals === reference.decimals,
    },
    "Independent synthetic event/state fixture. This checks the example, not Ethereum or Testril.",
  );
}

export async function verifyRpc(run, rpcUrl) {
  const sources = validateRun(run);
  if (run.mode !== "live" || run.provenance.kind === "synthetic")
    throw new Error("Synthetic runs cannot be verified against Ethereum.");
  if (run.inputs.toBlock - run.inputs.fromBlock > 10000)
    throw new Error(
      "Reference verification is limited to 10,000 blocks per run.",
    );
  const url = new URL(rpcUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use an HTTP(S) reference RPC.");
  let id = 0;
  async function rpc(method, params) {
    const requestId = ++id;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Reference RPC request failed.");
    const result = await response.json();
    if (result.id !== requestId || result.error || result.result === undefined)
      throw new Error(
        "Reference RPC rejected a verification request. Archive state and EIP-1898 support are required.",
      );
    return result.result;
  }
  if (BigInt(await rpc("eth_chainId", [])) !== BigInt(run.inputs.chainId))
    throw new Error("Reference RPC is on the wrong chain.");
  async function hashesMatch() {
    for (const [block, hash] of sources) {
      const source = await rpc("eth_getBlockByNumber", [hex(block), false]);
      if (source?.hash?.toLowerCase() !== hash || source.number !== hex(block))
        return false;
    }
    return true;
  }
  const before = await hashesMatch();
  const rawLogs = await rpc("eth_getLogs", [
    {
      address: run.inputs.token,
      topics: [transferTopic],
      fromBlock: hex(run.inputs.fromBlock),
      toBlock: hex(run.inputs.toBlock - 1),
    },
  ]);
  if (!Array.isArray(rawLogs))
    throw new Error("Reference RPC did not return logs.");
  const unique = new Set();
  let logHashesMatch = true;
  const logs = rawLogs.map((log) => {
    const block = Number(BigInt(log.blockNumber));
    const key = `${log.blockHash}:${log.logIndex}`;
    if (
      log.removed ||
      unique.has(key) ||
      log.address?.toLowerCase() !== run.inputs.token ||
      log.topics?.length !== 3 ||
      log.topics[0] !== transferTopic ||
      !/^0x0{24}[0-9a-fA-F]{40}$/.test(log.topics[1]) ||
      !/^0x0{24}[0-9a-fA-F]{40}$/.test(log.topics[2]) ||
      !/^0x[0-9a-fA-F]{64}$/.test(log.data) ||
      !Number.isSafeInteger(block) ||
      block < run.inputs.fromBlock ||
      block >= run.inputs.toBlock
    )
      throw new Error(
        "Reference RPC returned invalid or duplicate Transfer logs.",
      );
    unique.add(key);
    if (sources.get(block) !== log.blockHash?.toLowerCase())
      logHashesMatch = false;
    return {
      block,
      from: `0x${log.topics[1].slice(-40).toLowerCase()}`,
      to: `0x${log.topics[2].slice(-40).toLowerCase()}`,
      amountRaw: BigInt(log.data).toString(),
    };
  });
  async function balance(block) {
    const result = await rpc("eth_call", [
      {
        to: run.inputs.token,
        data: `0x70a08231${run.inputs.treasury.slice(2).padStart(64, "0")}`,
      },
      { blockHash: sources.get(block), requireCanonical: true },
    ]);
    if (!/^0x[0-9a-fA-F]{64}$/.test(result))
      throw new Error("Invalid balanceOf response.");
    return BigInt(result).toString();
  }
  const openingRaw = await balance(run.inputs.fromBlock - 1);
  const closingRaw = await balance(run.inputs.toBlock - 1);
  const decimals = await rpc("eth_call", [
    { to: run.inputs.token, data: "0x313ce567" },
    { blockHash: sources.get(run.inputs.toBlock - 1), requireCanonical: true },
  ]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(decimals))
    throw new Error("Invalid token decimals response.");
  return compare(
    run,
    {
      edges: aggregateLogs(logs),
      openingRaw,
      closingRaw,
      hashesMatch: before && logHashesMatch && (await hashesMatch()),
      decimalsMatch: BigInt(decimals) === BigInt(run.inputs.decimals),
    },
    "Reference JSON-RPC: token-wide Transfer logs and balanceOf at pinned canonical blocks. Trust the provider for complete logs and correct historical state; this is not a cryptographic proof.",
  );
}
