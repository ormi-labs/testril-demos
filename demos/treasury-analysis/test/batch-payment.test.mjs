import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, keccak256, recoverTypedDataAddress } from "viem";
import {
  acceptedQuote,
  signBatchPayment,
  batchDomain,
  voucherTypes,
  authorizationTypes,
  collectorAddress,
} from "../src/batch-payment.mjs";
import { testConfig } from "./live-peer.mjs";

test("the deposit signature targets the collector; vouchers authorize only accumulated charges", async () => {
  const { config } = testConfig();
  const accepted = acceptedQuote(
    {
      accepts: [
        {
          scheme: "batch-settlement",
          network: "eip155:84532",
          asset: config.token.address,
          amount: "120",
          payTo: config.wallets[0].address,
          extra: {
            receiverAuthorizer: config.wallets[1].address,
            withdrawDelay: 3600,
            name: "USDC",
            version: "2",
          },
        },
      ],
    },
    config,
  );
  const signed = await signBatchPayment(accepted, [], config, "100000");
  const first = JSON.parse(signed.payload).payload;
  assert.equal(signed.depositRaw, "100000");
  assert.equal(first.voucher.maxClaimableAmount, "120");
  const voucherSigner = await recoverTypedDataAddress({
    domain: batchDomain,
    types: voucherTypes,
    primaryType: "Voucher",
    message: { channelId: first.voucher.channelId, maxClaimableAmount: 120n },
    signature: first.voucher.signature,
  });
  assert.equal(voucherSigner, config.payer.address);
  const auth = first.deposit.authorization.erc3009Authorization;
  assert.equal(auth.to, collectorAddress);
  assert.notEqual(auth.to, accepted.payTo);
  const signer = await recoverTypedDataAddress({
    domain: {
      name: "USDC",
      version: "2",
      chainId: 84532,
      verifyingContract: config.token.address,
    },
    types: authorizationTypes,
    primaryType: "ReceiveWithAuthorization",
    signature: auth.signature,
    message: {
      from: config.payer.address,
      to: collectorAddress,
      value: 100000n,
      validAfter: 0n,
      validBefore: BigInt(auth.validBefore),
      nonce: keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [first.voucher.channelId, auth.salt],
        ),
      ),
    },
  });
  assert.equal(signer, config.payer.address);
  const channel = {
    network: "eip155:84532",
    channelConfig: first.channelConfig,
    channelId: first.voucher.channelId,
    balance: "100000",
    chargedCumulativeAmount: "120",
    closed: false,
  };
  const second = JSON.parse(
    (
      await signBatchPayment(
        { ...accepted, amount: "21" },
        [channel],
        config,
        "0",
      )
    ).payload,
  ).payload;
  assert.equal(second.type, "voucher");
  assert.equal(second.voucher.maxClaimableAmount, "141");
  assert.equal(second.deposit, undefined);
  assert.deepEqual(second.channelConfig, first.channelConfig);
});
