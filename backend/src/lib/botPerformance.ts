const BOT_DONE_STATUSES = new Set(["accepted", "ready", "out_for_delivery", "delivered"]);

export type BotPerformanceReport = {
  day: string;
  total: number;
  /** Chegaram a Aceito (ou além) sem o atendente assumir. */
  botOnly: number;
  /** O atendente clicou em Assumir durante o pedido. */
  humanAssisted: number;
  /** Ainda em Recebido ou cancelados sem intervenção. */
  other: number;
  /** false enquanto a migration 056 não rodou (intervenções não são contadas). */
  tracking: boolean;
};

export function summarizeBotPerformance(
  day: string,
  rows: { status: string; humanAssisted: boolean }[],
  tracking: boolean,
): BotPerformanceReport {
  let botOnly = 0;
  let humanAssisted = 0;
  let other = 0;
  for (const row of rows) {
    if (row.humanAssisted) humanAssisted += 1;
    else if (BOT_DONE_STATUSES.has(row.status)) botOnly += 1;
    else other += 1;
  }
  return { day, total: rows.length, botOnly, humanAssisted, other, tracking };
}
