import { getStore, updateOrderStatus } from "../data/repository.js";
import type { Order } from "../types.js";
import { notifyCustomerOrderStatus } from "./orderNotify.js";

/**
 * Se a loja estiver com aceite automático, move o pedido para Aceito
 * com o prazo médio padrão e avisa o cliente no WhatsApp.
 */
export async function applyAutoAccept(order: Order): Promise<Order> {
  if (order.status !== "received") return order;

  let store;
  try {
    store = await getStore();
  } catch {
    return order;
  }

  if (!store.autoAcceptOrders) return order;
  const minutes = Math.round(Number(store.defaultAcceptMinutes));
  if (!Number.isFinite(minutes) || minutes < 1) return order;

  try {
    const updated = await updateOrderStatus(
      order.id,
      "accepted",
      "Aceite automático",
      minutes,
    );
    if (!updated) return order;
    await notifyCustomerOrderStatus(updated).catch((error) => {
      console.error("Falha ao notificar aceite automático", error);
    });
    return updated;
  } catch (error) {
    console.error("Falha no aceite automático do pedido", error);
    return order;
  }
}
