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

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

export function createOperator(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    async pay(accepted, channels) {
      const charge = BigInt(accepted.amount);
      const channel = channels.find(
        (c) =>
          !c.closed &&
          c.network === accepted.network &&
          same(c.channelConfig.payer, account.address) &&
          same(c.channelConfig.receiver, accepted.payTo) &&
          same(c.channelConfig.token, accepted.asset) &&
          BigInt(c.balance) >= BigInt(c.chargedCumulativeAmount) + charge,
      );
      if (!channel)
        throw new Error(
          `No funded Testril channel for ${account.address} on ${accepted.network} covers ${charge} atoms. Deposit into a channel first.`,
        );
      const domain = batchDomain(accepted.network);
      const channelId = hashTypedData({
        domain,
        types: channelTypes,
        primaryType: "ChannelConfig",
        message: channel.channelConfig,
      });
      if (!same(channelId, channel.channelId))
        throw new Error("The inspected channel does not match its config.");
      const maxClaimableAmount =
        BigInt(channel.chargedCumulativeAmount) + charge;
      return {
        x402Version: 2,
        scheme: "batch-settlement",
        accepted,
        payload: {
          type: "voucher",
          channelConfig: channel.channelConfig,
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
