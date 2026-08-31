import { formatBRL } from "../lib/money.js";
import type { Fulfillment, Order, OrderStatus } from "../types.js";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_EMOJI: Record<OrderStatus, string> = {
  received: "📥",
  preparing: "👨‍🍳",
  ready: "✅",
  out_for_delivery: "🛵",
  delivered: "🎉",
  cancelled: "❌",
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

export function isOpenOrderStatus(status: OrderStatus) {
  return status !== "delivered" && status !== "cancelled";
}

export function formatOrderStatusMessage(order: Order, opts?: { thanks?: boolean }) {
  const emoji = STATUS_EMOJI[order.status] ?? "📦";
  const lines = [
    opts?.thanks ? "Por nada! 😊" : null,
    `${emoji} Pedido *#${order.code}*: agora está *${describeOrderStatus(order.status)}*.`,
  ];
  if (order.status === "preparing" && order.prepMinutes) {
    lines.push(`⏱️ Tempo estimado: ${formatPrepDuration(order.prepMinutes)}`);
  }
  if (order.status === "delivered") {
    lines.push("Obrigado pela preferência! Esperamos você de novo. 🍕");
    lines.push("Qualquer nova interação por aqui inicia um *novo pedido*.");
  } else if (order.status !== "cancelled") {
    lines.push(`💰 Total: ${formatBRL(order.totalCents)}.`);
    lines.push("Assim que mudar, eu te aviso por aqui.");
  }
  return lines.filter(Boolean).join("\n");
}

export function isAllowedOrderStatus(
  fulfillment: Fulfillment,
  status: OrderStatus,
) {
  return !(fulfillment === "pickup" && status === "out_for_delivery");
}
