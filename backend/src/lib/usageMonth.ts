import { getStore } from "../data/repository.js";
import { dayKeyInTimeZone, isValidDayKey } from "./orderStats.js";

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
/** Limite do período consultado (APIs de uso paginam por dia). */
const MAX_RANGE_DAYS = 93;

/** Diferença (ms) entre o relógio local do fuso e UTC naquele instante. */
function offsetMs(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map(part => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Instante (unix s) da meia-noite local do dia YYYY-MM-DD. */
function localMidnightSeconds(day: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date);
  let instant = wall - offsetMs(wall, timeZone);
  instant = wall - offsetMs(instant, timeZone);
  return Math.floor(instant / 1000);
}

function addDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

const MAX_CACHED_REPORTS = 20;

/** Guarda o relatório no cache por período, descartando os mais antigos. */
export function rememberReport<T>(cache: Map<string, { at: number; report: T }>, key: string, report: T) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), report });
  while (cache.size > MAX_CACHED_REPORTS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export type UsageRange = {
  timeZone: string;
  /** Início inclusivo e fim exclusivo (unix s), limitado a agora. */
  startSeconds: number;
  endSeconds: number;
  from: string;
  to: string;
  today: string;
  /** Dia local de um bucket; pelo meio do intervalo, funciona com buckets em UTC ou no fuso local. */
  dayKey: (startSeconds: number, endSeconds?: number) => string;
};

/**
 * Período de consumo no fuso da loja. Sem datas válidas, usa o mês corrente.
 * `previousMonth` devolve o mês anterior inteiro.
 */
export async function resolveUsageRange(
  input: { from?: unknown; to?: unknown; previousMonth?: boolean } = {},
  now = new Date(),
): Promise<UsageRange> {
  const store = await getStore().catch(() => null);
  const timeZone = store?.timezone || DEFAULT_TIME_ZONE;
  const today = dayKeyInTimeZone(now, timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;

  let from: string;
  let to: string;
  if (input.previousMonth) {
    to = addDays(monthStart, -1);
    from = `${to.slice(0, 7)}-01`;
  } else {
    const rawFrom = typeof input.from === "string" ? input.from : "";
    const rawTo = typeof input.to === "string" ? input.to : "";
    from = isValidDayKey(rawFrom) ? rawFrom : monthStart;
    to = isValidDayKey(rawTo) ? rawTo : today;
    if (to > today) to = today;
    if (from > to) from = to;
    const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
    if (from < earliest) from = earliest;
  }

  const startSeconds = localMidnightSeconds(from, timeZone);
  const endSeconds = Math.min(localMidnightSeconds(addDays(to, 1), timeZone), Math.floor(now.getTime() / 1000));
  return {
    timeZone,
    startSeconds,
    endSeconds: Math.max(endSeconds, startSeconds + 1),
    from,
    to,
    today,
    dayKey: (bucketStart: number, bucketEnd?: number) =>
      dayKeyInTimeZone(new Date((bucketEnd ? (bucketStart + bucketEnd) / 2 : bucketStart) * 1000), timeZone),
  };
}
