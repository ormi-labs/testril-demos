// JSON amounts are decimal integer strings; calculations use BigInt.
export function rawAmount(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
    throw new Error("Amounts must be unsigned decimal integer strings.");
  return BigInt(value);
}

export function decimalAmount(raw) {
  const value = rawAmount(raw);
  const whole = (value / 1000000n).toLocaleString("en-US");
  const fraction = (value % 1000000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function feeAmount(raw) {
  const value = rawAmount(raw);
  return `${value / 1000000n}.${(value % 1000000n).toString().padStart(6, "0")}`;
}

export function parseUsdc(value) {
  if (
    typeof value !== "string" ||
    !/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value.trim())
  )
    throw new Error("Use a USDC amount with up to six decimal places.");
  const [whole = "", fraction = ""] = value.trim().split(".");
  return (
    BigInt(whole || "0") * 1000000n +
    BigInt(fraction.padEnd(6, "0"))
  ).toString();
}
