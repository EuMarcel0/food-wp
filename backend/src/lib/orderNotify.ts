import { describeOrderStatus, formatPrepDuration } from "../conversation/status.js";
import { formatBRL } from "./money.js";
import { sendText } from "./whatsapp.js";
import type { Order } from "../types.js";

/** Mesma mensagem enviada ao mudar status manualmente no painel. */
export async function notifyCustomerOrderStatus(order: Order) {
  if (!order.customerPhone) return;
  const lines = [
    `Atualização do pedido *#${order.code}*: agora está *${describeOrderStatus(order.status)}*.`,
  ];
  if (order.status === "preparing" && order.prepMinutes) {
    lines.push(`Tempo estimado: ${formatPrepDuration(order.prepMinutes)}`);
  }
  lines.push(`Total: ${formatBRL(order.totalCents)}.`);
  await sendText(order.customerPhone, lines.join("\n"));
}
