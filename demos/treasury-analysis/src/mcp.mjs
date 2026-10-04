// Discovery is free. Deliberately expose no payment or materialization methods.
export async function discover(endpoint) {
  let session;
  let id = 0;
  async function request(method, params, notification = false) {
    const requestId = ++id;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (session) headers["mcp-session-id"] = session;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(!notification && { id: requestId }),
        method,
        params,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Testril discovery request failed.");
    session = response.headers.get("mcp-session-id") ?? session;
    if (notification) {
      await response.text();
      return;
    }
    const body = await response.text();
    const messages = response.headers
      .get("content-type")
      ?.includes("text/event-stream")
      ? body
          .split(/\r?\n\r?\n/)
          .map((event) =>
            event
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n"),
          )
          .filter(Boolean)
          .filter((line) => line !== "[DONE]")
          .map((line) => JSON.parse(line))
      : [JSON.parse(body)];
    const message = messages.find((item) => item.id === requestId);
    if (!message || message.error)
      throw new Error("Invalid Testril discovery response.");
    return message.result;
  }
  function unwrap(result) {
    if (result.isError)
      throw new Error("Testril could not inspect its function catalog.");
    if (result.structuredContent) return result.structuredContent;
    const content = result.content?.find((item) => item.type === "text");
    if (!content) throw new Error("Testril returned no function catalog.");
    return JSON.parse(content.text);
  }
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "treasury-analysis", version: "0.1.0" },
  });
  await request("notifications/initialized", {}, true);
  try {
    const catalog = unwrap(
      await request("tools/call", {
        name: "inspect",
        arguments: { subject: "functions" },
      }),
    );
    if (catalog.outcome !== "success" || !Array.isArray(catalog.functions))
      throw new Error("Testril returned no usable function catalog.");
    // Keep the deployment's vocabulary visible rather than inventing aliases.
    return {
      checkedAt: new Date().toISOString(),
      catalog,
      note: "Free catalog inspection only. This version consumes sample data; a deployed transfer-edge function and paid client are required for live reports.",
    };
  } finally {
    if (session)
      await fetch(endpoint, {
        method: "DELETE",
        headers: { "mcp-session-id": session },
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
  }
}
