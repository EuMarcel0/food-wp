import type { BusinessHoursDay, Weekday } from "../types";

export const WEEKDAY_ROWS: { day: Weekday; label: string }[] = [
  { day: 1, label: "Segunda" },
  { day: 2, label: "Terça" },
  { day: 3, label: "Quarta" },
  { day: 4, label: "Quinta" },
  { day: 5, label: "Sexta" },
  { day: 6, label: "Sábado" },
  { day: 0, label: "Domingo" },
];

export function defaultBusinessHours(): BusinessHoursDay[] {
  return WEEKDAY_ROWS.map(({ day }) => ({
    day,
    closed: false,
    open: "18:00",
    close: "23:00",
  }));
}

export function hoursFromStore(hours?: BusinessHoursDay[] | null): BusinessHoursDay[] {
  const defaults = defaultBusinessHours();
  if (!hours?.length) return defaults;
  const byDay = new Map(hours.map((item) => [item.day, item]));
  return defaults.map((item) => byDay.get(item.day) ?? item);
}

function minutesFromHhmm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Se a loja está no horário de atendimento agora (timezone IANA). */
export function isStoreOpenNow(
  hours: BusinessHoursDay[] | null | undefined,
  timeZone = "America/Sao_Paulo",
  at = new Date(),
): boolean {
  if (!hours?.length) return true;
  const days = hoursFromStore(hours);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const weekdayMap: Record<string, Weekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = weekday ? weekdayMap[weekday] : undefined;
  if (day === undefined || hour == null || minute == null) return false;
  const row = days.find((item) => item.day === day);
  if (!row || row.closed) return false;
  const open = minutesFromHhmm(row.open);
  const close = minutesFromHhmm(row.close);
  if (open == null || close == null) return false;
  const now = Number(hour) * 60 + Number(minute);
  if (open === close) return true;
  if (close > open) return now >= open && now < close;
  // Cruza meia-noite
  return now >= open || now < close;
}

export function todayHoursLabel(
  hours: BusinessHoursDay[] | null | undefined,
  timeZone = "America/Sao_Paulo",
  at = new Date(),
): string {
  if (!hours?.length) return "Horário não configurado";
  const days = hoursFromStore(hours);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(at);
  const weekdayMap: Record<string, Weekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = weekdayMap[weekday];
  const row = days.find((item) => item.day === day);
  if (!row || row.closed) return "Fechado hoje";
  return `${row.open} – ${row.close}`;
}
