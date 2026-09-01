import type { OrderStatus } from "../types.js";

const STATUSES: OrderStatus[] = [
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const OPEN_STATUSES = new Set<OrderStatus>([
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
]);

export type OrderStatsRow = {
  status: string;
  fulfillment: string;
  prepMinutes?: number | null;
  createdAt: string;
};

export type OrderStats = {
  /** Dia filtrado (YYYY-MM-DD no fuso da loja). */
  day: string;
  open: number;
  total: number;
  byStatus: Record<OrderStatus, number>;
  today: {
    created: number;
    delivered: number;
    cancelled: number;
    open: number;
  };
  /** Entrega × retirada entre todos os pedidos do dia (não só abertos). */
  openByFulfillment: {
    delivery: number;
    pickup: number;
  };
  oldestOpenMinutes: number | null;
  avgPrepMinutesToday: number | null;
};

function emptyByStatus(): Record<OrderStatus, number> {
  return {
    received: 0,
    accepted: 0,
    preparing: 0,
    ready: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
  };
}

export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isValidDayKey(value: string | undefined | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/**
 * Estatísticas dos pedidos criados no dia `dayKey` (fuso da loja).
 * Sem dayKey, usa o dia corrente.
 */
export function buildOrderStats(
  rows: OrderStatsRow[],
  timeZone = "America/Sao_Paulo",
  dayKey?: string,
): OrderStats {
  const resolvedDay = isValidDayKey(dayKey)
    ? dayKey
    : dayKeyInTimeZone(new Date(), timeZone);
  const byStatus = emptyByStatus();
  const now = Date.now();

  let open = 0;
  let dayCreated = 0;
  let dayDelivered = 0;
  let dayCancelled = 0;
  let dayOpen = 0;
  let dayDelivery = 0;
  let dayPickup = 0;
  let oldestOpenMs: number | null = null;
  let prepSum = 0;
  let prepCount = 0;

  for (const row of rows) {
    const createdMs = Date.parse(row.createdAt);
    const createdDay =
      Number.isFinite(createdMs)
        ? dayKeyInTimeZone(new Date(createdMs), timeZone)
        : "";
    if (createdDay !== resolvedDay) continue;

    const status = (
      STATUSES.includes(row.status as OrderStatus) ? row.status : "received"
    ) as OrderStatus;
    byStatus[status] += 1;
    dayCreated += 1;

    if (row.fulfillment === "pickup") dayPickup += 1;
    else dayDelivery += 1;

    const isOpen = OPEN_STATUSES.has(status);
    if (isOpen) {
      open += 1;
      dayOpen += 1;
      if (Number.isFinite(createdMs)) {
        const age = now - createdMs;
        if (oldestOpenMs === null || age > oldestOpenMs) oldestOpenMs = age;
      }
    }

    if (status === "delivered") dayDelivered += 1;
    if (status === "cancelled") dayCancelled += 1;

    if (
      row.prepMinutes != null &&
      Number.isFinite(row.prepMinutes) &&
      Number(row.prepMinutes) > 0
    ) {
      prepSum += Number(row.prepMinutes);
      prepCount += 1;
    }
  }

  return {
    day: resolvedDay,
    open,
    total: dayCreated,
    byStatus,
    today: {
      created: dayCreated,
      delivered: dayDelivered,
      cancelled: dayCancelled,
      open: dayOpen,
    },
    openByFulfillment: {
      delivery: dayDelivery,
      pickup: dayPickup,
    },
    oldestOpenMinutes:
      oldestOpenMs === null ? null : Math.max(0, Math.round(oldestOpenMs / 60_000)),
    avgPrepMinutesToday:
      prepCount === 0 ? null : Math.round(prepSum / prepCount),
  };
}
