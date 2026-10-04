// JSON carries integers as decimal strings. Arithmetic never uses floating point.
export function rawAmount(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Amounts must be unsigned decimal integer strings.");
  }
  return BigInt(value);
}

export function decimalAmount(raw, decimals = 6, signed = false) {
  const value = BigInt(raw);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = (absolute / scale).toLocaleString("en-US");
  const fraction = (absolute % scale).toString().padStart(decimals, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return `${negative ? "−" : signed && value > 0n ? "+" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
}

export function usdAmount(raw) {
  const value = rawAmount(raw);
  return `$${value / 1000000n}.${(value % 1000000n).toString().padStart(6, "0")}`;
}

export function parseUsd(value) {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Use a dollar budget with up to six decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 1000000n +
    BigInt(fraction.padEnd(6, "0"))
  ).toString();
}
