import {
  getConversation,
  getStore,
  saveConversation,
  upsertCustomer,
} from "../data/repository.js";
import {
  formatDeliveredNewOrderPrompt,
  formatDeliveredThanks,
  formatOrderStatusMessage,
} from "../conversation/status.js";
import { isStoreOpen } from "./businessHours.js";
import { sendButtons, sendText } from "./whatsapp.js";
import { isOrderFlowState, type Order } from "../types.js";

export const NEW_ORDER_YES = "new_order:yes";
export const NEW_ORDER_NO = "new_order:no";

const NEW_ORDER_BUTTONS = [
  { id: NEW_ORDER_YES, title: "✅ Sim" },
  { id: NEW_ORDER_NO, title: "❌ Não" },
];

/**
 * Após entregue/retirado: pergunta se quer novo pedido e deixa a conversa nessa etapa.
 * Com a loja fechada só agradece (não faz sentido oferecer novo pedido).
 */
export async function offerNewOrderAfterDelivered(order: Order) {
  if (!order.customerPhone) return;
  const store = await getStore().catch(() => null);
  if (store && !isStoreOpen(store.businessHours, store.timezone)) {
    await sendText(order.customerPhone, formatDeliveredThanks(order));
    return;
  }
  const customer = await upsertCustomer(order.customerPhone, order.customerName);
  const current = await getConversation(customer.id);
  if (current && isOrderFlowState(current.state)) {
    // Já está montando outro pedido: só agradece, sem apagar o carrinho em andamento.
    await sendText(order.customerPhone, formatDeliveredThanks(order));
    return;
  }
  await saveConversation(customer, "awaiting_new_order", { cart: [] }, { reopen: true });
  await sendButtons(
    order.customerPhone,
    formatDeliveredNewOrderPrompt(order),
    NEW_ORDER_BUTTONS,
  );
}

/** Mesma mensagem enviada ao mudar status manualmente no painel. */
export async function notifyCustomerOrderStatus(
  order: Order,
  opts?: { cancelReason?: string | null },
) {
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
      cancelReason: opts?.cancelReason,
    }),
  );
}
