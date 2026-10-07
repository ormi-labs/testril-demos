import { randomBytes } from "node:crypto";
import { encodeAbiParameters, hashTypedData, keccak256 } from "viem";
import { rawAmount } from "../public/amounts.js";
import { sameAddress } from "./live-config.mjs";

export const escrowAddress = "0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003";
export const collectorAddress = "0x4020806089470a89826cB9fB1f4059150b550004";
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
export const authorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
export const batchDomain = {
  name: "x402 Batch Settlement",
  version: "1",
  chainId: 84532,
  verifyingContract: escrowAddress,
};
const salt = () => `0x${randomBytes(32).toString("hex")}`;

export function acceptedQuote(quote, config) {
  const accepted = quote.accepts?.find(
    (row) =>
      row.scheme === "batch-settlement" &&
      row.network === "eip155:84532" &&
      sameAddress(row.asset, config.token.address),
  );
  if (
    !accepted ||
    !/^0x[0-9a-fA-F]{40}$/.test(accepted.payTo ?? "") ||
    !/^0x[0-9a-fA-F]{40}$/.test(accepted.extra?.receiverAuthorizer ?? "") ||
    accepted.extra?.withdrawDelay !== 3600 ||
    accepted.extra?.name !== "USDC" ||
    accepted.extra?.version !== "2"
  )
    throw new Error(
      "The quote must use Base Sepolia USDC and the supported batch settlement terms.",
    );
  rawAmount(accepted.amount);
  if (BigInt(accepted.amount) === 0n)
    throw new Error("The quote has no positive charge.");
  return { ...accepted, maxTimeoutSeconds: 3600 };
}

export async function signBatchPayment(accepted, channels, config, depositRaw) {
  const payer = config.payer;
  const charge = rawAmount(accepted.amount);
  const candidates = channels.filter(
    (row) =>
      !row.closed &&
      row.network === accepted.network &&
      sameAddress(row.channelConfig?.payer, payer.address) &&
      sameAddress(row.channelConfig?.payerAuthorizer, payer.address) &&
      sameAddress(row.channelConfig?.receiver, accepted.payTo) &&
      sameAddress(
        row.channelConfig?.receiverAuthorizer,
        accepted.extra.receiverAuthorizer,
      ) &&
      sameAddress(row.channelConfig?.token, accepted.asset) &&
      row.channelConfig?.withdrawDelay === accepted.extra.withdrawDelay,
  );
  const row =
    candidates.find(
      (r) =>
        rawAmount(r.balance) >= rawAmount(r.chargedCumulativeAmount) + charge,
    ) ?? candidates[0];
  const channelConfig = row?.channelConfig ?? {
    payer: payer.address,
    payerAuthorizer: payer.address,
    receiver: accepted.payTo,
    receiverAuthorizer: accepted.extra.receiverAuthorizer,
    token: accepted.asset,
    withdrawDelay: accepted.extra.withdrawDelay,
    salt: salt(),
  };
  const channelId = hashTypedData({
    domain: batchDomain,
    types: channelTypes,
    primaryType: "ChannelConfig",
    message: channelConfig,
  });
  if (row && channelId.toLowerCase() !== row.channelId.toLowerCase())
    throw new Error("The inspected channel does not match its config.");
  const prior = row ? rawAmount(row.chargedCumulativeAmount) : 0n;
  const maximum = prior + charge;
  const shortfall = maximum - (row ? rawAmount(row.balance) : 0n);
  const deposit = shortfall > 0n ? rawAmount(depositRaw) : 0n;
  if (deposit < shortfall)
    throw new Error("The escrow deposit allowance cannot cover this quote.");
  const payload = {
    type: deposit ? "deposit" : "voucher",
    channelConfig,
    voucher: {
      channelId,
      maxClaimableAmount: maximum.toString(),
      signature: await payer.signTypedData({
        domain: batchDomain,
        types: voucherTypes,
        primaryType: "Voucher",
        message: { channelId, maxClaimableAmount: maximum },
      }),
    },
  };
  if (deposit) {
    const authorizationSalt = salt();
    const nonce = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }],
        [channelId, authorizationSalt],
      ),
    );
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 120);
    const signature = await payer.signTypedData({
      domain: {
        name: accepted.extra.name,
        version: accepted.extra.version,
        chainId: 84532,
        verifyingContract: accepted.asset,
      },
      types: authorizationTypes,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: payer.address,
        to: collectorAddress,
        value: deposit,
        validAfter: 0n,
        validBefore,
        nonce,
      },
    });
    payload.deposit = {
      amount: deposit.toString(),
      authorization: {
        erc3009Authorization: {
          from: payer.address,
          to: collectorAddress,
          value: deposit.toString(),
          validAfter: "0",
          validBefore: validBefore.toString(),
          salt: authorizationSalt,
          signature,
        },
      },
    };
  }
  return {
    payload: JSON.stringify({
      x402Version: 2,
      scheme: "batch-settlement",
      accepted,
      payload,
    }),
    depositRaw: deposit.toString(),
  };
}
