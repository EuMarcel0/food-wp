import { api } from "./api";
import { formatCnpj } from "./format";
import {
  fetchPrintAgentHealth,
  getPrintAgentToken,
  printOrderViaAgent,
} from "./printAgent";
import { toast } from "./toast";

const PRINTED_KEY = "food-wp-auto-printed-orders";
const AUTO_ACTOR = "Aceite automático";

function readPrinted() {
  try {
    const raw = sessionStorage.getItem(PRINTED_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set<string>();
  }
}

function markPrinted(orderId: string) {
  const set = readPrinted();
  set.add(orderId);
  try {
    sessionStorage.setItem(PRINTED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

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

/** Imprime via agente local quando o aceite automático aceita o pedido. */
export async function printAfterAutoAccept(orderId: string, orderCode?: string) {
  if (!orderId || readPrinted().has(orderId)) return;
  if (!getPrintAgentToken()) {
    toast.error(
      `Pedido #${orderCode || "?"} aceito, mas o agente de impressão não está conectado.`,
    );
    return;
  }

  try {
    await fetchPrintAgentHealth();
  } catch {
    toast.error(
      `Pedido #${orderCode || "?"} aceito, mas o agente de impressão está offline.`,
    );
    return;
  }

  try {
    const [order, store] = await Promise.all([
      api.order(orderId, true),
      api.store(),
    ]);
    markPrinted(orderId);
    await printOrderViaAgent({
      order,
      store: {
        ...store,
        cnpj: store.cnpj ? formatCnpj(store.cnpj) : store.cnpj,
      },
    });
    toast.success(`Pedido #${order.code} enviado à impressora.`);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : `Falha ao imprimir o pedido #${orderCode || "?"}.`,
    );
  }
}
