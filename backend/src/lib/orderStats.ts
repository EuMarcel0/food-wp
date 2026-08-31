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
  open: number;
  total: number;
  byStatus: Record<OrderStatus, number>;
  today: {
    created: number;
    delivered: number;
    cancelled: number;
    open: number;
  };
  openByFulfillment: {
    delivery: number;
    pickup: number;
  };
  /** Minutos do pedido aberto mais antigo (fila). */
  oldestOpenMinutes: number | null;
  /** Média de minutos de preparo informados nos pedidos de hoje. */
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

export function buildOrderStats(
  rows: OrderStatsRow[],
  timeZone = "America/Sao_Paulo",
): OrderStats {
  const byStatus = emptyByStatus();
  const todayKey = dayKeyInTimeZone(new Date(), timeZone);
  const now = Date.now();

  let open = 0;
  let todayCreated = 0;
  let todayDelivered = 0;
  let todayCancelled = 0;
  let todayOpen = 0;
  let openDelivery = 0;
  let openPickup = 0;
  let oldestOpenMs: number | null = null;
  let prepSum = 0;
  let prepCount = 0;

  for (const row of rows) {
    const status = (
      STATUSES.includes(row.status as OrderStatus) ? row.status : "received"
    ) as OrderStatus;
    byStatus[status] += 1;

    const createdMs = Date.parse(row.createdAt);
    const createdDay =
      Number.isFinite(createdMs)
        ? dayKeyInTimeZone(new Date(createdMs), timeZone)
        : "";
    const isToday = createdDay === todayKey;
    if (isToday) todayCreated += 1;

    const isOpen = OPEN_STATUSES.has(status);
    if (isOpen) {
      open += 1;
      if (row.fulfillment === "pickup") openPickup += 1;
      else openDelivery += 1;
      if (Number.isFinite(createdMs)) {
        const age = now - createdMs;
        if (oldestOpenMs === null || age > oldestOpenMs) oldestOpenMs = age;
      }
      if (isToday) todayOpen += 1;
    }

    if (isToday && status === "delivered") todayDelivered += 1;
    if (isToday && status === "cancelled") todayCancelled += 1;

    if (
      isToday &&
      row.prepMinutes != null &&
      Number.isFinite(row.prepMinutes) &&
      Number(row.prepMinutes) > 0
    ) {
      prepSum += Number(row.prepMinutes);
      prepCount += 1;
    }
  }

  return {
    open,
    total: rows.length,
    byStatus,
    today: {
      created: todayCreated,
      delivered: todayDelivered,
      cancelled: todayCancelled,
      open: todayOpen,
    },
    openByFulfillment: {
      delivery: openDelivery,
      pickup: openPickup,
    },
    oldestOpenMinutes:
      oldestOpenMs === null ? null : Math.max(0, Math.round(oldestOpenMs / 60_000)),
    avgPrepMinutesToday:
      prepCount === 0 ? null : Math.round(prepSum / prepCount),
  };
}
