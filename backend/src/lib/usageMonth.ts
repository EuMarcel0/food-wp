import { getStore } from "../data/repository.js";
import { dayKeyInTimeZone } from "./orderStats.js";

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

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

/** Mês corrente no fuso da loja: início (unix s), dia de hoje e chave de dia para timestamps. */
export async function currentUsageMonth(now = new Date()) {
  const store = await getStore().catch(() => null);
  const timeZone = store?.timezone || DEFAULT_TIME_ZONE;
  const today = dayKeyInTimeZone(now, timeZone);
  const [year, month] = today.split("-").map(Number);
  const localMidnight = Date.UTC(year, month - 1, 1);
  let start = localMidnight - offsetMs(localMidnight, timeZone);
  start = localMidnight - offsetMs(start, timeZone);
  return {
    timeZone,
    startSeconds: Math.floor(start / 1000),
    from: `${today.slice(0, 7)}-01`,
    today,
    /** Dia local de um bucket; pelo meio do intervalo, funciona com buckets em UTC ou no fuso local. */
    dayKey: (startSeconds: number, endSeconds?: number) =>
      dayKeyInTimeZone(
        new Date(((endSeconds ? (startSeconds + endSeconds) / 2 : startSeconds)) * 1000),
        timeZone,
      ),
  };
}
