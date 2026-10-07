import { readFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { parseUsdc } from "../public/amounts.js";

export const liveFixture = JSON.parse(
  await readFile(new URL("../fixtures/live.json", import.meta.url), "utf8"),
);

export function liveConfig(env = process.env) {
  for (const name of ["TESTRIL_CHARGE_CAP_USDC", "TESTRIL_ESCROW_CAP_USDC"])
    if (BigInt(parseUsdc(env[name] ?? "0")) > 100000n)
      throw new Error(
        `${name} must not exceed the approved 0.1 test USDC limit.`,
      );
  const accounts = {};
  for (const wallet of liveFixture.wallets) {
    const expected =
      env[wallet.keyEnv.replace("PRIVATE_KEY", "ADDRESS")] ?? wallet.address;
    accounts[wallet.id] = account(wallet.keyEnv, expected, env);
  }
  const payer = account(
    "TESTRIL_PAYER_PRIVATE_KEY",
    env.TESTRIL_PAYER_ADDRESS ?? liveFixture.payer,
    env,
  );
  if (
    Object.values(accounts).some((a) => sameAddress(a.address, payer.address))
  )
    throw new Error(
      "The Testril payer must be separate from the demo wallets.",
    );
  if (
    new Set(Object.values(accounts).map((a) => a.address.toLowerCase()))
      .size !== 3
  )
    throw new Error("Use three distinct demo wallets.");
  return {
    ...liveFixture,
    wallets: liveFixture.wallets.map(({ keyEnv: _keyEnv, ...wallet }) => ({
      ...wallet,
      address: accounts[wallet.id].address,
    })),
    accounts,
    payer,
    rpcUrl: env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    mcpUrl: env.TESTRIL_MCP_URL ?? "https://dev.testril.ai/mcp",
    chargeCapRaw: parseUsdc(env.TESTRIL_CHARGE_CAP_USDC ?? "0"),
    depositCapRaw: parseUsdc(env.TESTRIL_ESCROW_CAP_USDC ?? "0"),
  };
}

function account(name, expected, env) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(env[name] ?? ""))
    throw new Error(`${name} must be a local 0x-prefixed private key.`);
  let result;
  try {
    result = privateKeyToAccount(env[name]);
  } catch {
    throw new Error(`${name} is not a valid private key.`);
  }
  if (!sameAddress(result.address, expected))
    throw new Error(`${name} does not match its configured public address.`);
  return result;
}

export function sameAddress(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase()
  );
}
