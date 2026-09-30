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
import { formatBRL } from "./money.js";
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

function itemsByName(order: Order) {
  const map = new Map<string, { quantity: number; unitPriceCents: number }>();
  for (const item of order.items ?? []) {
    const current = map.get(item.name);
    map.set(item.name, {
      quantity: (current?.quantity ?? 0) + item.quantity,
      unitPriceCents: item.unitPriceCents,
    });
  }
  return map;
}

/** Itens alterados no painel: avisa o cliente o que entrou/saiu e o total anterior e novo. */
export async function notifyCustomerOrderItemsChanged(before: Order, after: Order) {
  if (!after.customerPhone) return;
  const previous = itemsByName(before);
  const next = itemsByName(after);
  const added: string[] = [];
  const removed: string[] = [];
  const repriced: string[] = [];

  for (const [name, item] of next) {
    const old = previous.get(name);
    const delta = item.quantity - (old?.quantity ?? 0);
    if (delta > 0) added.push(`${delta}x ${name}`);
    else if (delta < 0) removed.push(`${-delta}x ${name}`);
    else if (old && old.unitPriceCents !== item.unitPriceCents) repriced.push(name);
  }
  for (const [name, item] of previous) {
    if (!next.has(name)) removed.push(`${item.quantity}x ${name}`);
  }
  if (!added.length && !removed.length && !repriced.length) return;

  const lines = [`✏️ *Pedido #${after.code} alterado:*`];
  for (const item of added) lines.push(`➕ Adicionado: ${item}`);
  for (const item of removed) lines.push(`➖ Removido: ${item}`);
  for (const item of repriced) lines.push(`💲 Valor ajustado: ${item}`);
  lines.push("", `Total anterior: ${formatBRL(before.totalCents)}`, `*Total novo: ${formatBRL(after.totalCents)}*`);
  await sendText(after.customerPhone, lines.join("\n"));
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
