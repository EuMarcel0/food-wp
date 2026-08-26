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

export function isAllowedOrderStatus(
  fulfillment: Fulfillment,
  status: OrderStatus,
) {
  return !(fulfillment === "pickup" && status === "out_for_delivery");
}
