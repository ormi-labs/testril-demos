import {
  encodeAbiParameters,
  hashDomain,
  hashTypedData,
  keccak256,
} from "viem";
import { atoms, paymentNetwork, usdc } from "./model.js";

export const escrow = "0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003";
export const collector = "0x4020806089470a89826cB9fB1f4059150b550004";
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const random = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("")}`;
const domainTypes = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];
export const channelTypes = {
  ChannelConfig: [
    { name: "payer", type: "address" },
    { name: "payerAuthorizer", type: "address" },
    { name: "receiver", type: "address" },
    { name: "receiverAuthorizer", type: "address" },
    { name: "token", type: "address" },
    { name: "withdrawDelay", type: "uint40" },
    { name: "salt", type: "bytes32" },
  ],
};
export const voucherTypes = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "maxClaimableAmount", type: "uint128" },
  ],
};
const authorizationFields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];
export const batchDomain = {
  name: "x402 Batch Settlement",
  version: "1",
  chainId: 8453,
  verifyingContract: escrow,
};

export function selectOffer(challenge, provider) {
  const offered = challenge.accepts?.filter(
    (a) => a.network === paymentNetwork && same(a.asset, usdc),
  );
  const accepted =
    offered?.find((a) => a.scheme === "exact") ??
    (provider === "testril"
      ? offered?.find((a) => a.scheme === "batch-settlement")
      : undefined);
  if (!accepted)
    throw new Error(
      `${provider === "testril" ? "Testril" : "Allium"} is not offering a supported Base mainnet USDC payment. No signature requested.`,
    );
  if (
    !addressPattern.test(accepted.payTo) ||
    atoms(accepted.amount) <= 0n ||
    !["USDC", "USD Coin"].includes(accepted.extra?.name) ||
    accepted.extra?.version !== "2"
  )
    throw new Error("The USDC payment quote is invalid.");
  if (
    accepted.scheme === "batch-settlement" &&
    (!addressPattern.test(accepted.extra.receiverAuthorizer) ||
      accepted.extra.withdrawDelay !== 3600)
  )
    throw new Error("Unsupported escrow terms.");
  return { ...accepted, maxTimeoutSeconds: accepted.maxTimeoutSeconds ?? 3600 };
}

export function paymentPlan(accepted, channels, payer) {
  if (accepted.scheme === "exact")
    return { depositAmount: "0", chargeAmount: accepted.amount };
  const charge = atoms(accepted.amount);
  const eligible = channels.filter(
    (c) =>
      !c.closed &&
      c.network === paymentNetwork &&
      same(c.channelConfig?.payer, payer) &&
      same(c.channelConfig?.payerAuthorizer, payer) &&
      same(c.channelConfig?.receiver, accepted.payTo) &&
      same(
        c.channelConfig?.receiverAuthorizer,
        accepted.extra.receiverAuthorizer,
      ) &&
      same(c.channelConfig?.token, usdc) &&
      c.channelConfig?.withdrawDelay === accepted.extra.withdrawDelay,
  );
  const channel =
    eligible.find(
      (c) => atoms(c.balance) >= atoms(c.chargedCumulativeAmount) + charge,
    ) ?? eligible[0];
  const config = channel?.channelConfig ?? {
    payer,
    payerAuthorizer: payer,
    receiver: accepted.payTo,
    receiverAuthorizer: accepted.extra.receiverAuthorizer,
    token: usdc,
    withdrawDelay: accepted.extra.withdrawDelay,
    salt: random(),
  };
  const channelId = hashTypedData({
    domain: batchDomain,
    types: channelTypes,
    primaryType: "ChannelConfig",
    message: config,
  });
  if (channel && !same(channelId, channel.channelId))
    throw new Error("The inspected escrow channel has an invalid identity.");
  const maximum =
    (channel ? atoms(channel.chargedCumulativeAmount) : 0n) + charge;
  const shortfall = maximum - (channel ? atoms(channel.balance) : 0n);
  const minimum = atoms(accepted.extra.minDeposit ?? "10000");
  const deposit =
    shortfall > 0n ? (shortfall > minimum ? shortfall : minimum) : 0n;
  return {
    config,
    channelId,
    maximum: maximum.toString(),
    depositAmount: deposit.toString(),
    chargeAmount: accepted.amount,
  };
}

export async function signPayment(wallet, payer, challenge, accepted, plan) {
  const accounts = await wallet.request({ method: "eth_accounts" });
  if (!same(accounts[0], payer))
    throw new Error("The wallet account changed. Start a new run.");
  if ((await wallet.request({ method: "eth_chainId" })) !== "0x2105")
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
  if ((await wallet.request({ method: "eth_chainId" })) !== "0x2105")
    throw new Error("Switch the wallet to Base mainnet.");
  const tokenDomain = {
    name: accepted.extra.name,
    version: accepted.extra.version,
    chainId: 8453,
    verifyingContract: usdc,
  };
  const separator = await wallet.request({
    method: "eth_call",
    params: [{ to: usdc, data: "0x3644e515" }, "latest"],
  });
  if (
    !same(
      separator,
      hashDomain({ domain: tokenDomain, types: { EIP712Domain: domainTypes } }),
    )
  )
    throw new Error(
      "The quote's USDC signing domain does not match the on-chain token. No payment signed.",
    );
  async function sign(domain, types, primaryType, message) {
    const current = await wallet.request({ method: "eth_accounts" });
    if (!same(current[0], payer))
      throw new Error("The wallet account changed. Start a new run.");
    return wallet.request({
      method: "eth_signTypedData_v4",
      params: [
        payer,
        JSON.stringify({
          domain,
          types: { EIP712Domain: domainTypes, ...types },
          primaryType,
          message,
        }),
      ],
    });
  }
  if (accepted.scheme === "exact") {
    // Allium's live gateway publishes an absolute validity deadline; Testril publishes a duration.
    const now = Math.floor(Date.now() / 1000);
    const timeout = accepted.maxTimeoutSeconds;
    if (!Number.isSafeInteger(timeout) || timeout <= 0)
      throw new Error("The payment quote has invalid timing terms.");
    const deadline =
      timeout > 86400
        ? Math.min(timeout, now + 120)
        : now + Math.min(timeout, 120);
    if (!Number.isSafeInteger(deadline) || deadline <= now)
      throw new Error("The payment quote expired.");
    const authorization = {
      from: payer,
      to: accepted.payTo,
      value: accepted.amount,
      validAfter: "0",
      validBefore: String(deadline),
      nonce: random(),
    };
    const signature = await sign(
      tokenDomain,
      { TransferWithAuthorization: authorizationFields },
      "TransferWithAuthorization",
      authorization,
    );
    return {
      x402Version: 2,
      resource: challenge.resource,
      accepted,
      payload: { signature, authorization },
    };
  }
  for (const contract of [escrow, collector]) {
    const code = await wallet.request({
      method: "eth_getCode",
      params: [contract, "latest"],
    });
    if (typeof code !== "string" || code.length <= 2)
      throw new Error(
        "Testril's escrow contracts are not deployed on Base mainnet. No payment signed.",
      );
  }
  const payload = {
    type: atoms(plan.depositAmount) ? "deposit" : "voucher",
    channelConfig: plan.config,
    voucher: {
      channelId: plan.channelId,
      maxClaimableAmount: plan.maximum,
      signature: await sign(batchDomain, voucherTypes, "Voucher", {
        channelId: plan.channelId,
        maxClaimableAmount: plan.maximum,
      }),
    },
  };
  if (atoms(plan.depositAmount)) {
    const salt = random();
    const message = {
      from: payer,
      to: collector,
      value: plan.depositAmount,
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 120),
      nonce: keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [plan.channelId, salt],
        ),
      ),
    };
    const signature = await sign(
      tokenDomain,
      { ReceiveWithAuthorization: authorizationFields },
      "ReceiveWithAuthorization",
      message,
    );
    payload.deposit = {
      amount: plan.depositAmount,
      authorization: {
        erc3009Authorization: {
          from: message.from,
          to: message.to,
          value: message.value,
          validAfter: message.validAfter,
          validBefore: message.validBefore,
          salt,
          signature,
        },
      },
    };
  }
  return { x402Version: 2, scheme: "batch-settlement", accepted, payload };
}
