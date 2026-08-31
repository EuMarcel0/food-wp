import { formatOrderStatusMessage } from "../conversation/status.js";
import { sendText } from "./whatsapp.js";
import type { Order } from "../types.js";

/** Mesma mensagem enviada ao mudar status manualmente no painel. */
export async function notifyCustomerOrderStatus(order: Order) {
  if (!order.customerPhone) return;
  await sendText(order.customerPhone, formatOrderStatusMessage(order));
}
