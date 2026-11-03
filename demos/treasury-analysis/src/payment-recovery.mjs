import { hashTypedData } from "viem";
import { batchDomain, channelTypes, voucherTypes } from "./batch-payment.mjs";
import { sameAddress } from "./live-config.mjs";
import { demoFailure } from "./errors.mjs";

const unresolved = () =>
  demoFailure(
    "PAYMENT_RECONCILIATION_REQUIRED",
    "The original payment could not be confirmed. Preserve its journal and reconcile before paying again.",
    { reason: "missing-settlement" },
  );

// A zero cumulative voucher authenticates the payer without authorizing a charge.
// Testril resolves the payment identifier before considering a new purchase.
export async function lookupPayment(config, mcp, entry) {
  if (
    !entry.paymentIdentifier ||
    !["read", "materialize"].includes(entry.verb) ||
    !entry.args ||
    !/^[0-9]+$/.test(entry.chargeRaw) ||
    BigInt(entry.chargeRaw) === 0n
  )
    throw unresolved();
  const network = `eip155:${config.chain.id}`;
  const inspected = await mcp.call("inspect", {
    subject: "channels",
    payer: config.payer.address,
    network,
  });
  if (inspected.outcome !== "success" || !Array.isArray(inspected.channels))
    throw unresolved();
  const candidates = inspected.channels.filter(
    (c) =>
      c?.network === network &&
      sameAddress(c.channelConfig?.payer, config.payer.address) &&
      sameAddress(c.channelConfig?.payerAuthorizer, config.payer.address) &&
      sameAddress(c.channelConfig?.token, config.token.address) &&
      /^0x[0-9a-fA-F]{40}$/.test(c.channelConfig?.receiver ?? "") &&
      /^0x[0-9a-fA-F]{40}$/.test(c.channelConfig?.receiverAuthorizer ?? "") &&
      (!entry.accepted ||
        (sameAddress(c.channelConfig?.receiver, entry.accepted.payTo) &&
          sameAddress(
            c.channelConfig?.receiverAuthorizer,
            entry.accepted.extra?.receiverAuthorizer,
          ))),
  );
  if (
    !candidates.length ||
    new Set(candidates.map((c) => c.channelConfig.receiver.toLowerCase()))
      .size !== 1
  )
    throw unresolved();
  const channel = candidates[0];
  let channelId;
  try {
    channelId = hashTypedData({
      domain: batchDomain,
      types: channelTypes,
      primaryType: "ChannelConfig",
      message: channel.channelConfig,
    });
  } catch {
    throw unresolved();
  }
  if (!sameAddress(channelId, channel.channelId)) throw unresolved();
  const accepted = entry.accepted ?? {
    scheme: "batch-settlement",
    network,
    asset: config.token.address,
    amount: entry.chargeRaw,
    payTo: channel.channelConfig.receiver,
    maxTimeoutSeconds: 3600,
    extra: {
      receiverAuthorizer: channel.channelConfig.receiverAuthorizer,
      withdrawDelay: channel.channelConfig.withdrawDelay,
      name: "USDC",
      version: "2",
    },
  };
  if (
    accepted.scheme !== "batch-settlement" ||
    accepted.network !== network ||
    !sameAddress(accepted.asset, config.token.address) ||
    accepted.amount !== entry.chargeRaw
  )
    throw unresolved();
  const payment = {
    x402Version: 2,
    scheme: "batch-settlement",
    accepted,
    payload: {
      type: "voucher",
      channelConfig: channel.channelConfig,
      voucher: {
        channelId,
        maxClaimableAmount: "0",
        signature: await config.payer.signTypedData({
          domain: batchDomain,
          types: voucherTypes,
          primaryType: "Voucher",
          message: { channelId, maxClaimableAmount: 0n },
        }),
      },
    },
    extensions: {
      "payment-identifier": { info: { id: entry.paymentIdentifier } },
    },
  };
  const result = await mcp.call(entry.verb, entry.args, payment);
  const receipt = result.receipt;
  const quoteId = result.quote_id ?? result.job?.quote_id;
  const response = result.paymentResponse;
  const confirmedWork = receipt
    ? quoteId === entry.id &&
      receipt.quote_id === entry.id &&
      receipt.amount?.atoms === entry.chargeRaw &&
      ["paid", "accepted"].includes(receipt.state)
    : entry.verb === "materialize"
      ? result.result === "materializing" && result.job?.quote_id === entry.id
      : result.bound_function_id === entry.args.bound_function_id &&
        result.from_block === entry.args.from_block &&
        result.to_block === entry.args.to_block &&
        Array.isArray(result.values);
  if (
    result.outcome !== "success" ||
    (quoteId !== undefined && quoteId !== entry.id) ||
    !confirmedWork ||
    response?.success !== true ||
    response.network !== network ||
    !sameAddress(response.payer, config.payer.address) ||
    response.chargedAmount !== entry.chargeRaw
  )
    throw unresolved();
  return result;
}
