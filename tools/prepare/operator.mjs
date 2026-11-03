import { randomUUID } from "node:crypto";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const escrowAddress = "0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003";
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

export function batchDomain(network) {
  return {
    name: "x402 Batch Settlement",
    version: "1",
    chainId: Number(network.replace(/^eip155:/, "")),
    verifyingContract: escrowAddress,
  };
}

const zeroSalt = `0x${"0".repeat(64)}`;

export function channelConfigFor(accepted, payer) {
  return {
    payer,
    payerAuthorizer: payer,
    receiver: accepted.payTo,
    receiverAuthorizer: accepted.extra.receiverAuthorizer,
    token: accepted.asset,
    withdrawDelay: accepted.extra.withdrawDelay,
    salt: zeroSalt,
  };
}

export function createOperator(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    async pay(accepted, channels) {
      const domain = batchDomain(accepted.network);
      const channelConfig = channelConfigFor(accepted, account.address);
      const channelId = hashTypedData({
        domain,
        types: channelTypes,
        primaryType: "ChannelConfig",
        message: channelConfig,
      });
      const channel = channels.find(
        (c) => c.channelId.toLowerCase() === channelId,
      );
      const maxClaimableAmount =
        BigInt(channel?.chargedCumulativeAmount ?? 0) + BigInt(accepted.amount);
      return {
        x402Version: 2,
        scheme: "batch-settlement",
        accepted,
        payload: {
          type: "voucher",
          channelConfig,
          voucher: {
            channelId,
            maxClaimableAmount: maxClaimableAmount.toString(),
            signature: await account.signTypedData({
              domain,
              types: voucherTypes,
              primaryType: "Voucher",
              message: { channelId, maxClaimableAmount },
            }),
          },
        },
        extensions: { "payment-identifier": { info: { id: randomUUID() } } },
      };
    },
  };
}
