const seconds = (ms) => `${(ms / 1000).toFixed(3)}s`;

export function formatTransferTiming(timing, clickElapsedMs) {
  const total = clickElapsedMs ?? timing.elapsedMs;
  const label =
    clickElapsedMs === undefined
      ? "Send server operation"
      : timing.outcome === "success"
        ? "Send click → refreshed UI"
        : "Send click → failed";
  const lines = [
    `[INFO] ${label}: ${seconds(total)} (${timing.outcome}; ${timing.id})`,
  ];
  if (clickElapsedMs !== undefined)
    lines.push(
      `  Browser, local HTTP and rendering: ${seconds(Math.max(0, total - timing.elapsedMs))}`,
    );
  for (const stage of timing.stages) {
    lines.push(
      `  ${stage.name}: ${seconds(stage.elapsedMs)}${stage.overlapping ? " (detail times overlap; not additive)" : ""}`,
    );
    for (const detail of stage.details)
      lines.push(
        `    ${detail.name}: ${seconds(detail.elapsedMs)} (${detail.calls} calls)`,
      );
  }
  return lines.join("\n");
}
