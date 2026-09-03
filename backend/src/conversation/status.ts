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

function formatPrepMinutesPhrase(minutes: number) {
  const value = Math.max(1, Math.round(minutes));
  if (value === 1) return "1 minuto";
  if (value < 60) return `${value} minutos`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  const hourPart = hours === 1 ? "1 hora" : `${hours} horas`;
  if (!rest) return hourPart;
  const minPart = rest === 1 ? "1 minuto" : `${rest} minutos`;
  return `${hourPart} e ${minPart}`;
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
  const cancelHint =
    opts?.allowCustomerCancel && canCustomerCancelStatus(order.status)
      ? CUSTOMER_CANCEL_HINT
      : null;

  return [
    opts?.thanks ? "Por nada! 😊" : null,
    opts?.thanks ? "" : null,
    ...statusMessageLines(order),
    cancelHint,
  ]
    .filter((line): line is string => line != null)
    .join("\n")
    .trim();
}

function statusMessageLines(order: Order): string[] {
  const code = `*#${order.code}*`;
  const pickup = order.fulfillment === "pickup";

  switch (order.status) {
    case "received":
      return [
        `📥 Pedido ${code} recebido!`,
        "",
        "Avisaremos você por aqui quando houver uma nova atualização. 😊",
      ];
    case "accepted":
      return [
        `👍 Pedido ${code} foi aceito!`,
        "",
        "Já estamos cuidando do seu pedido. Avisaremos você por aqui quando houver uma nova atualização. 😊",
      ];
    case "preparing": {
      const lines = [`👨‍🍳 Pedido ${code} em preparo!`, ""];
      if (order.prepMinutes && order.prepMinutes > 0) {
        lines.push(
          `⏱️ Previsão: aproximadamente ${formatPrepMinutesPhrase(order.prepMinutes)}.`,
          "",
        );
      }
      lines.push("Avisaremos você por aqui quando houver uma nova atualização. 😊");
      return lines;
    }
    case "ready":
      if (pickup) {
        return [
          `✅ Pedido ${code} está pronto!`,
          "",
          "Pode vir retirar no local. Estamos te esperando. 🏪",
        ];
      }
      return [
        `✅ Pedido ${code} está pronto!`,
        "",
        "Estamos finalizando os últimos detalhes para a entrega. 🍕",
      ];
    case "out_for_delivery":
      return [
        `🛵 Pedido ${code} saiu para entrega!`,
        "",
        "O entregador já está a caminho do seu endereço. 😊",
      ];
    case "delivered":
      return [
        pickup ? `🎉 Pedido ${code} foi retirado!` : `🎉 Pedido ${code} foi entregue!`,
        "",
        "Obrigado pela preferência! Esperamos você de novo. 🍕",
      ];
    case "cancelled":
      return [`❌ Pedido ${code} foi cancelado.`];
  }
}

export function isAllowedOrderStatus(
  fulfillment: Fulfillment,
  status: OrderStatus,
) {
  return !(fulfillment === "pickup" && status === "out_for_delivery");
}
