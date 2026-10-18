export const paymentNetwork = "eip155:8453";
export const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const chargeCap = "250000";
export const depositCap = "250000";

export function reportSpec(fromHour = "2026-10-17T12") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(fromHour))
    throw new Error("Choose a whole UTC hour.");
  const start = new Date(`${fromHour}:00:00Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 13) !== fromHour
  )
    throw new Error("Invalid report hour.");
  const end = new Date(start.getTime() + 3 * 3600000);
  if (end.getTime() > Date.now())
    throw new Error("The report must end in the past.");
  return {
    chain: "ethereum",
    chainId: 1,
    factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
    pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    token0: {
      symbol: "USDC",
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      decimals: 6,
    },
    token1: {
      symbol: "WETH",
      address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      decimals: 18,
    },
    fromHour,
    toHour: end.toISOString().slice(0, 13),
    definition:
      "Sum absolute token amounts per Swap event, grouped by whole UTC hour. No USD valuation.",
  };
}

export function atoms(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
    throw new Error("Expected an exact unsigned integer string.");
  return BigInt(value);
}

export function decimal(value, places = 6) {
  const raw = atoms(value)
    .toString()
    .padStart(places + 1, "0");
  return `${raw.slice(0, -places)}.${raw.slice(-places)}`;
}

export function normalizeRows(rows, spec) {
  if (!Array.isArray(rows))
    throw new Error("The provider did not return report rows.");
  const found = new Map();
  for (const row of rows) {
    if (row.pool?.toLowerCase() !== spec.pool)
      throw new Error("A provider returned a different pool.");
    if (
      typeof row.hour !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(row.hour) ||
      row.hour < spec.fromHour ||
      row.hour >= spec.toHour
    )
      throw new Error("A provider returned a different hour range.");
    if (found.has(row.hour))
      throw new Error("A provider returned duplicate hours.");
    for (const key of ["swaps", "volume0", "volume1"]) atoms(row[key]);
    found.set(row.hour, {
      hour: row.hour,
      pool: spec.pool,
      swaps: row.swaps,
      volume0: row.volume0,
      volume1: row.volume1,
    });
  }
  const result = [];
  for (
    let time = Date.parse(`${spec.fromHour}:00:00Z`);
    time < Date.parse(`${spec.toHour}:00:00Z`);
    time += 3600000
  ) {
    const hour = new Date(time).toISOString().slice(0, 13);
    result.push(
      found.get(hour) ?? {
        hour,
        pool: spec.pool,
        swaps: "0",
        volume0: "0",
        volume1: "0",
      },
    );
  }
  return result;
}

export function compareRows(left, right, spec) {
  const a = normalizeRows(left, spec);
  const b = normalizeRows(right, spec);
  const differences = [];
  for (let i = 0; i < a.length; i++)
    for (const key of ["swaps", "volume0", "volume1"]) {
      if (a[i][key] !== b[i][key])
        differences.push({
          hour: a[i].hour,
          field: key,
          testril: a[i][key],
          allium: b[i][key],
        });
    }
  return { matches: differences.length === 0, differences };
}

export function validateRecording(run) {
  if (
    run?.schemaVersion !== 1 ||
    run.kind !== "recorded" ||
    !Number.isFinite(Date.parse(run.recordedAt))
  )
    throw new Error("Choose a version 1 recorded run.");
  const expected = reportSpec(run.spec?.fromHour);
  if (JSON.stringify(run.spec) !== JSON.stringify(expected))
    throw new Error("The recording uses a different report definition.");
  if (run.paymentNetwork !== paymentNetwork)
    throw new Error("The recording must use Base mainnet payments.");
  for (const name of ["testril", "allium"]) {
    const provider = run.providers?.[name];
    if (provider?.status !== "done")
      throw new Error(
        "Both providers must finish before a run can be recorded.",
      );
    normalizeRows(provider.rows, expected);
    for (const key of ["readMs", "preparationMs", "walletWaitMs", "totalMs"]) {
      if (!Number.isFinite(provider.timing?.[key]) || provider.timing[key] < 0)
        throw new Error("The recording has invalid timing.");
    }
    if (!Array.isArray(provider.payments) || provider.payments.length > 200)
      throw new Error("The recording has invalid payment evidence.");
    for (const payment of provider.payments) {
      atoms(payment.amount);
      atoms(payment.depositAmount);
      if (
        !["read", "preparation"].includes(payment.phase) ||
        !["confirmed", "unconfirmed"].includes(payment.confirmation)
      )
        throw new Error("The recording has invalid payment accounting.");
      if (
        payment.confirmation === "confirmed" &&
        (payment.receipt?.success !== true ||
          payment.receipt.network !== paymentNetwork ||
          !/^0x[a-f0-9]{40}$/i.test(payment.receipt.payer ?? "") ||
          (payment.receipt.chargedAmount !== undefined &&
            payment.receipt.chargedAmount !== payment.amount))
      )
        throw new Error(
          "A confirmed payment must include matching provider evidence.",
        );
    }
  }
  return run;
}
