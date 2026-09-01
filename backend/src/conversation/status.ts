import { formatBRL } from "../lib/money.js";
import type { Fulfillment, Order, OrderStatus } from "../types.js";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_EMOJI: Record<OrderStatus, string> = {
  received: "📥",
  accepted: "👍",
  preparing: "👨‍🍳",
  ready: "✅",
  out_for_delivery: "🛵",
  delivered: "🎉",
  cancelled: "❌",
};

/** Status em que o cliente pode cancelar pelo WhatsApp (quando a loja permitir). */
export const CUSTOMER_CANCEL_STATUSES: OrderStatus[] = [
  "received",
  "accepted",
  "preparing",
  "ready",
];

export const CUSTOMER_CANCEL_HINT =
  "Caso queira cancelar este pedido, digite exatamente: *Cancelar pedido*";

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

export function canCustomerCancelStatus(status: OrderStatus) {
  return CUSTOMER_CANCEL_STATUSES.includes(status);
}

export function formatOrderStatusMessage(
  order: Order,
  opts?: { thanks?: boolean; allowCustomerCancel?: boolean },
) {
  const thanks = opts?.thanks ? "Por nada! 😊" : null;
  const cancelHint =
    opts?.allowCustomerCancel && canCustomerCancelStatus(order.status)
      ? CUSTOMER_CANCEL_HINT
      : null;

  if (order.status === "accepted") {
    const eta =
      order.prepMinutes && order.prepMinutes > 0
        ? formatPrepDuration(order.prepMinutes)
        : null;
    return [
      thanks,
      eta
        ? `👍 Seu pedido *#${order.code}* foi aceito e levará em média *${eta}* para ficar pronto.`
        : `👍 Seu pedido *#${order.code}* foi *aceito*!`,
      `💰 Total: ${formatBRL(order.totalCents)}.`,
      "Assim que mudar, eu te aviso por aqui.",
      cancelHint,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const emoji = STATUS_EMOJI[order.status] ?? "📦";
  const lines = [
    thanks,
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
    lines.push(statusFollowUp(order));
    if (cancelHint) lines.push(cancelHint);
  }
  return lines.filter(Boolean).join("\n");
}

function statusFollowUp(order: Order) {
  if (order.status === "ready" && order.fulfillment === "pickup") {
    return "Você já pode retirar seu pedido. 🏪";
  }
  if (order.status === "out_for_delivery") {
    return "O entregador saiu e está a caminho do seu endereço. 🛵";
  }
  return "Assim que mudar, eu te aviso por aqui.";
}

export function isAllowedOrderStatus(
  fulfillment: Fulfillment,
  status: OrderStatus,
) {
  return !(fulfillment === "pickup" && status === "out_for_delivery");
}
