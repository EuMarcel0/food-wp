import type { Fulfillment, OrderStatus } from "../types.js";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export function describeOrderStatus(status: OrderStatus) {
  return STATUS_LABEL[status];
}

export function formatPrepDuration(minutes: number) {
  const value = Math.max(1, Math.round(minutes));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!rest) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${rest} min`;
}

export function isAllowedOrderStatus(
  fulfillment: Fulfillment,
  status: OrderStatus,
) {
  return !(fulfillment === "pickup" && status === "out_for_delivery");
}
