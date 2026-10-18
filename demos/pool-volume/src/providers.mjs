import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function alliumSql(spec) {
  return `SELECT TO_CHAR(DATE_TRUNC('hour', block_timestamp), 'YYYY-MM-DD"T"HH24') AS "hour",
  LOWER(liquidity_pool_address) AS "pool",
  TO_VARCHAR(COUNT(*)) AS "swaps",
  TO_VARCHAR(SUM(CASE WHEN LOWER(token_sold_address) = '${spec.token0.address}'
    THEN TO_DECIMAL(token_sold_amount_raw_str, 38, 0)
    ELSE TO_DECIMAL(token_bought_amount_raw_str, 38, 0) END)) AS "volume0",
  TO_VARCHAR(SUM(CASE WHEN LOWER(token_sold_address) = '${spec.token1.address}'
    THEN TO_DECIMAL(token_sold_amount_raw_str, 38, 0)
    ELSE TO_DECIMAL(token_bought_amount_raw_str, 38, 0) END)) AS "volume1"
FROM ethereum.dex.trades
WHERE liquidity_pool_address = '${spec.pool}'
  AND block_timestamp >= '${spec.fromHour}:00:00'::TIMESTAMP_NTZ
  AND block_timestamp < '${spec.toHour}:00:00'::TIMESTAMP_NTZ
  AND ((LOWER(token_sold_address) = '${spec.token0.address}' AND LOWER(token_bought_address) = '${spec.token1.address}')
    OR (LOWER(token_sold_address) = '${spec.token1.address}' AND LOWER(token_bought_address) = '${spec.token0.address}'))
GROUP BY 1, 2 ORDER BY 1`;
}

export async function connectTestril(url) {
  const client = new Client({ name: "pool-volume", version: "0.1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  } catch {
    await client.close();
    throw new Error("Cannot connect to Testril.");
  }
  return {
    async call(name, args, payment) {
      let result;
      try {
        result = await client.callTool(
          {
            name,
            arguments: args,
            ...(payment ? { _meta: { "x402/payment": payment } } : {}),
          },
          undefined,
          { timeout: 60000 },
        );
      } catch {
        throw new Error(
          "Testril request failed. A submitted payment may need reconciliation; it will not be retried.",
        );
      }
      let value;
      try {
        value =
          result.structuredContent ??
          JSON.parse(result.content.find((x) => x.type === "text")?.text);
      } catch {
        throw new Error("Testril returned invalid JSON.");
      }
      if (value?.x402Version === 2 && value.error === "payment_required") {
        const details = JSON.parse(result.content[1]?.text ?? "{}");
        return { ...value, ...details, outcome: "payment_required" };
      }
      if (result.isError || !value)
        throw new Error("Testril rejected the request.");
      return { ...value, receipt: result._meta?.["x402/payment-response"] };
    },
    close: () => client.close(),
  };
}

export function createAllium(url, fetcher = fetch) {
  return {
    async call(method, path, body, payment) {
      let response;
      try {
        response = await fetcher(new URL(path, url), {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(60000),
          headers: {
            "Content-Type": "application/json",
            "X-Prefer-Payment": "x402",
            ...(payment
              ? {
                  "PAYMENT-SIGNATURE": Buffer.from(
                    JSON.stringify(payment),
                  ).toString("base64"),
                }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new Error(
          "Allium request failed. A submitted payment may need reconciliation; it will not be retried.",
        );
      }
      const text = await response.text();
      if (text.length > 1000000)
        throw new Error("Allium returned an oversized response.");
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error("Allium returned invalid JSON.");
      }
      if (response.status === 402)
        return { ...value, outcome: "payment_required" };
      if (!response.ok)
        throw new Error(
          `Allium returned HTTP ${response.status}. ${response.status === 401 || response.status === 403 ? "Accountless access to this operation is unavailable." : "The run was stopped; no automatic payment retry."}`,
        );
      let receipt;
      const header = response.headers.get("payment-response");
      if (header) {
        try {
          receipt = JSON.parse(Buffer.from(header, "base64").toString());
        } catch {
          throw new Error("Allium returned invalid payment evidence.");
        }
      }
      return { value, receipt };
    },
  };
}
