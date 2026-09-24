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
import { playKitchenPrintSound } from "./notifySound";

const AUTO_ACTOR = "Aceite automático";

let draining = false;
const watchingPrint = new Set<string>();

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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Quando o print-agent imprime sozinho, o painel ainda toca o alerta
 * (serviço Windows às vezes não emite beep na sessão do usuário).
 */
async function watchPrintedThenAlert(orderId: string) {
  if (!orderId || watchingPrint.has(orderId)) return;
  watchingPrint.add(orderId);
  try {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await sleep(400);
      try {
        const order = await api.order(orderId, true);
        if (order.autoPrintedAt) {
          playKitchenPrintSound();
          return;
        }
      } catch {
        // ignore — tenta de novo
      }
    }
  } finally {
    watchingPrint.delete(orderId);
  }
}

/**
 * Imprime um pedido aceito via claim no servidor (evita double-print multi-PC).
 * Se o print-agent já estiver pollando a fila (`queuePolling`), o painel NÃO
 * imprime — só o agente imprime (evita 2 cupons no mesmo pedido).
 */
export async function printAfterAutoAccept(orderId: string, orderCode?: string) {
  if (!orderId || !canAutoPrintHere()) return;

  let health;
  try {
    health = await fetchPrintAgentHealth();
  } catch {
    // Agente offline: a fila no print-agent (se configurada) ou outro tick retenta.
    return;
  }
  if (health.queuePolling) {
    void watchPrintedThenAlert(orderId);
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
    playKitchenPrintSound();
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

/**
 * Mantém o agente sincronizado com a API.
 * Só imprime pelo painel se o agente NÃO estiver pollando a fila.
 */
export async function drainAutoPrintQueue() {
  if (draining || !canAutoPrintHere()) return;
  draining = true;
  try {
    let health;
    try {
      health = await fetchPrintAgentHealth();
    } catch {
      return;
    }
    // Garante que o agente saiba a URL da API (poll próprio, sem painel).
    await pushApiBaseToAgent().catch(() => undefined);

    // Agente já consome a fila — painel só configura, não imprime.
    if (health.queuePolling) return;

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
