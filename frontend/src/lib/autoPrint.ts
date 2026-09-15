import { api } from "./api";
import { formatCnpj } from "./format";
import {
  fetchPrintAgentHealth,
  getPrintAgentToken,
  isAutoPrintStation,
  printOrderViaAgent,
} from "./printAgent";
import { toast } from "./toast";

const PRINTED_KEY = "food-wp-auto-printed-orders";
const PRINT_CHANNEL = "food-wp-auto-print";
const AUTO_ACTOR = "Aceite automático";

function readPrinted() {
  try {
    // localStorage: compartilhado entre abas do mesmo navegador.
    const raw = localStorage.getItem(PRINTED_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set<string>();
  }
}

function markPrinted(orderId: string) {
  const set = readPrinted();
  set.add(orderId);
  // Mantém só os últimos pedidos (evita crescer sem limite).
  const trimmed = [...set].slice(-200);
  try {
    localStorage.setItem(PRINTED_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(PRINT_CHANNEL);
    channel.postMessage({ type: "printed", orderId });
    channel.close();
  } catch {
    // ignore
  }
}

function listenPrinted(orderId: string, onPrinted: () => void) {
  try {
    const channel = new BroadcastChannel(PRINT_CHANNEL);
    channel.onmessage = (event) => {
      const data = event.data as { type?: string; orderId?: string } | null;
      if (data?.type === "printed" && data.orderId === orderId) {
        onPrinted();
      }
    };
    return () => channel.close();
  } catch {
    return () => undefined;
  }
}

async function withPrintLock<T>(
  orderId: string,
  task: () => Promise<T>,
): Promise<T | null> {
  const locks = navigator.locks;
  if (!locks?.request) {
    return task();
  }
  return locks.request(
    `food-wp-auto-print:${orderId}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return null;
      return task();
    },
  );
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
  if (!isAutoPrintStation()) return;
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

  let cancelled = false;
  const stopListen = listenPrinted(orderId, () => {
    cancelled = true;
  });

  try {
    const printed = await withPrintLock(orderId, async () => {
      if (cancelled || readPrinted().has(orderId)) return false;

      const [order, store] = await Promise.all([
        api.order(orderId, true),
        api.store(),
      ]);
      if (cancelled || readPrinted().has(orderId)) return false;

      await printOrderViaAgent({
        order,
        store: {
          ...store,
          cnpj: store.cnpj ? formatCnpj(store.cnpj) : store.cnpj,
        },
      });
      markPrinted(orderId);
      toast.success(`Pedido #${order.code} enviado à impressora.`);
      return true;
    });

    // Outra aba/PC já pegou o lock — ok, não é erro.
    if (printed === null || printed === false) return;
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : `Falha ao imprimir o pedido #${orderCode || "?"}.`,
    );
  } finally {
    stopListen();
  }
}
