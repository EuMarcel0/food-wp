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
