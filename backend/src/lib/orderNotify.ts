import {
  getStore,
  saveConversation,
  upsertCustomer,
} from "../data/repository.js";
import {
  formatDeliveredNewOrderPrompt,
  formatOrderStatusMessage,
} from "../conversation/status.js";
import { sendButtons, sendText } from "./whatsapp.js";
import type { Order } from "../types.js";

export const NEW_ORDER_YES = "new_order:yes";
export const NEW_ORDER_NO = "new_order:no";

const NEW_ORDER_BUTTONS = [
  { id: NEW_ORDER_YES, title: "✅ Sim" },
  { id: NEW_ORDER_NO, title: "❌ Não" },
];

/** Após entregue/retirado: pergunta se quer novo pedido e deixa a conversa nessa etapa. */
export async function offerNewOrderAfterDelivered(order: Order) {
  if (!order.customerPhone) return;
  const customer = await upsertCustomer(order.customerPhone, order.customerName);
  await saveConversation(customer, "awaiting_new_order", { cart: [] }, { reopen: true });
  await sendButtons(
    order.customerPhone,
    formatDeliveredNewOrderPrompt(order),
    NEW_ORDER_BUTTONS,
  );
}

/** Mesma mensagem enviada ao mudar status manualmente no painel. */
export async function notifyCustomerOrderStatus(order: Order) {
  if (!order.customerPhone) return;
  if (order.status === "delivered") {
    await offerNewOrderAfterDelivered(order);
    return;
  }
  const store = await getStore();
  await sendText(
    order.customerPhone,
    formatOrderStatusMessage(order, {
      allowCustomerCancel: store.allowCustomerCancel,
    }),
  );
}
