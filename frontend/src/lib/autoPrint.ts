import { api } from "./api";
import { formatCnpj } from "./format";
import {
  fetchPrintAgentHealth,
  getPrintAgentToken,
  getPrintStationId,
  isAutoPrintStation,
  printOrderViaAgent,
  pushApiBaseToAgent,
} from "./printAgent";
import { toast } from "./toast";

const AUTO_ACTOR = "Aceite automático";

let draining = false;

export function isAutoAcceptNotification(item: {
  type: string;
  actorName?: string;
  changeSummary?: string | null;
}) {
  if (item.type !== "order_updated") return false;
  if (item.actorName?.trim() !== AUTO_ACTOR) return false;
  const summary = item.changeSummary ?? "";
  return /aceito/i.test(summary);
}

/** Pode esta estação tentar imprimir? */
function canAutoPrintHere() {
  return isAutoPrintStation() && Boolean(getPrintAgentToken());
}

/**
 * Imprime um pedido aceito via claim no servidor (evita double-print multi-PC).
 * Também usada pelo drain da fila.
 */
export async function printAfterAutoAccept(orderId: string, orderCode?: string) {
  if (!orderId || !canAutoPrintHere()) return;

  try {
    await fetchPrintAgentHealth();
  } catch {
    // Agente offline: a fila no print-agent (se configurada) ou outro tick retenta.
    return;
  }

  const claimedBy = getPrintStationId();
  let claimed = false;
  try {
    const order = await api.claimOrderPrint(orderId, claimedBy, true);
    claimed = true;
    const store = await api.store();
    await printOrderViaAgent({
      order,
      store: {
        ...store,
        cnpj: store.cnpj ? formatCnpj(store.cnpj) : store.cnpj,
      },
    });
    await api.completeOrderPrint(orderId, claimedBy, true);
    toast.success(`Pedido #${order.code} enviado à impressora.`);
  } catch (error) {
    if (claimed) {
      await api.failOrderPrint(orderId, claimedBy, true).catch(() => undefined);
    }
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    // Outra estação já pegou / já impresso — silencioso.
    if (/já impresso|reservado|409/i.test(message)) return;
    toast.error(
      message || `Falha ao imprimir o pedido #${orderCode || "?"}.`,
    );
  }
}

/** Consome a fila server-side (backlog + pedidos novos). */
export async function drainAutoPrintQueue() {
  if (draining || !canAutoPrintHere()) return;
  draining = true;
  try {
    try {
      await fetchPrintAgentHealth();
    } catch {
      return;
    }
    // Garante que o agente saiba a URL da API (poll próprio, sem painel).
    await pushApiBaseToAgent().catch(() => undefined);

    const { items } = await api.orderPrintQueue(true);
    for (const item of items) {
      await printAfterAutoAccept(item.id, item.code);
    }
  } catch {
    // ignore — próximo tick
  } finally {
    draining = false;
  }
}
