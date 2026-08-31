export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BusinessHoursDay = {
  day: Weekday;
  closed: boolean;
  open: string;
  close: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function defaultBusinessHours(): BusinessHoursDay[] {
  return WEEK_ORDER.map((day) => ({
    day,
    closed: false,
    open: "18:00",
    close: "23:00",
  }));
}

export function isValidTime(value: string) {
  return TIME_RE.test(value);
}

function asWeekday(value: unknown): Weekday | null {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return day as Weekday;
}

export function parseBusinessHours(raw: unknown): BusinessHoursDay[] | null {
  if (raw == null) return null;
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { days?: unknown }).days)
      ? (raw as { days: unknown[] }).days
      : null;
  if (!rows) {
    throw new Error("Informe os horários de cada dia da semana.");
  }
  if (!rows.length) return null;

  const byDay = new Map<Weekday, BusinessHoursDay>();
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      throw new Error("Horário de funcionamento inválido.");
    }
    const item = row as Record<string, unknown>;
    const day = asWeekday(item.day);
    if (day == null) {
      throw new Error("Informe um dia da semana válido.");
    }
    const closed = Boolean(item.closed);
    const open = String(item.open ?? "18:00");
    const close = String(item.close ?? "23:00");
    if (!closed && (!isValidTime(open) || !isValidTime(close))) {
      throw new Error("Informe horários no formato HH:mm.");
    }
    byDay.set(day, {
      day,
      closed,
      open: isValidTime(open) ? open : "18:00",
      close: isValidTime(close) ? close : "23:00",
    });
  }

  return WEEK_ORDER.map((day) => {
    return (
      byDay.get(day) ?? {
        day,
        closed: true,
        open: "18:00",
        close: "23:00",
      }
    );
  });
}

function minutesOfDay(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function localClock(now: Date, timeZone: string) {
  const fallback = {
    day: now.getDay() as Weekday,
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
  try {
    const zone = timeZone.trim() || DEFAULT_TIMEZONE;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const weekday = WEEKDAY_KEYS.indexOf(
      read("weekday") as (typeof WEEKDAY_KEYS)[number],
    );
    const hour = Number(read("hour"));
    const minute = Number(read("minute"));
    return {
      day: (weekday >= 0 ? weekday : fallback.day) as Weekday,
      minutes:
        (Number.isFinite(hour) ? hour : 0) * 60 +
        (Number.isFinite(minute) ? minute : 0),
    };
  } catch {
    return fallback;
  }
}

function coversInstant(day: BusinessHoursDay | undefined, minutes: number, role: "today" | "yesterday") {
  if (!day || day.closed) return false;
  const open = minutesOfDay(day.open);
  const close = minutesOfDay(day.close);
  if (open === close) return role === "today";
  if (close > open) {
    return role === "today" && minutes >= open && minutes < close;
  }
  if (role === "today") return minutes >= open;
  return minutes < close;
}

export function isStoreOpen(
  hours: BusinessHoursDay[] | null | undefined,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
) {
  if (!hours?.length) return true;
  const clock = localClock(now, timeZone);
  const today = hours.find((item) => item.day === clock.day);
  if (coversInstant(today, clock.minutes, "today")) return true;
  const yesterday = hours.find((item) => item.day === ((clock.day + 6) % 7) as Weekday);
  return coversInstant(yesterday, clock.minutes, "yesterday");
}

function dayRangeLabel(start: Weekday, end: Weekday) {
  if (start === end) {
    const name = DAY_LABELS[start];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return `${DAY_SHORT[start]} a ${DAY_SHORT[end]}`;
}

function hoursSignature(day: BusinessHoursDay) {
  return day.closed ? "closed" : `${day.open}-${day.close}`;
}

function formatWindow(day: BusinessHoursDay) {
  if (day.closed) return "fechado";
  return `${day.open} às ${day.close}`;
}

export function formatBusinessHoursLines(hours: BusinessHoursDay[] | null | undefined) {
  if (!hours?.length) return [];
  const byDay = new Map(hours.map((item) => [item.day, item]));
  const lines: string[] = [];
  let index = 0;
  while (index < WEEK_ORDER.length) {
    const start = WEEK_ORDER[index];
    const current = byDay.get(start) ?? {
      day: start,
      closed: true,
      open: "18:00",
      close: "23:00",
    };
    const signature = hoursSignature(current);
    let endIndex = index;
    while (
      endIndex + 1 < WEEK_ORDER.length &&
      hoursSignature(
        byDay.get(WEEK_ORDER[endIndex + 1]) ?? {
          day: WEEK_ORDER[endIndex + 1],
          closed: true,
          open: "18:00",
          close: "23:00",
        },
      ) === signature
    ) {
      endIndex += 1;
    }
    lines.push(
      `• ${dayRangeLabel(start, WEEK_ORDER[endIndex])} · ${formatWindow(current)}`,
    );
    index = endIndex + 1;
  }
  return lines;
}

export function closedStoreMessage(
  storeName: string,
  hours: BusinessHoursDay[] | null | undefined,
) {
  const schedule = formatBusinessHoursLines(hours);
  const allClosed = hours?.length ? hours.every((day) => day.closed) : false;
  const lines = [
    `😴 A *${storeName}* está fechada agora.`,
    allClosed
      ? "No momento não estamos atendendo pelo WhatsApp."
      : schedule.length
        ? ["🕐 Horário de funcionamento:", ...schedule].join("\n")
        : null,
    "Quando reabrirmos, é só mandar uma mensagem. 👋",
  ].filter(Boolean);
  return lines.join("\n");
}
