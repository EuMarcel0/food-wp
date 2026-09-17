import { hostname } from "node:os";
import { loadConfig, saveConfig } from "./config.js";
import { rawPrintWindows } from "./rawPrint.js";
import { buildReceiptEscPos } from "./receipt.js";

/**
 * @typedef {{
 *   id: string;
 *   code: string;
 *   requestedAt?: string;
 * }} PrintQueueItem
 */

let pollTimer = null;
let polling = false;

function apiBase() {
  const config = loadConfig();
  return String(config.apiBaseUrl || "").replace(/\/$/, "");
}

async function readError(response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // ignore
  }
  return body || `Erro ${response.status}`;
}

async function apiFetch(path, init = {}) {
  const base = apiBase();
  if (!base) throw new Error("apiBaseUrl não configurado");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(await readError(response));
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Imprime pedidos aceitos direto pela API — não depende do navegador aberto.
 * @param {(task: () => Promise<unknown>) => Promise<unknown>} enqueuePrint
 */
export function startPrintQueuePoller(enqueuePrint) {
  stopPrintQueuePoller();
  const tick = () => {
    void drainPrintQueue(enqueuePrint).catch((error) => {
      console.error("[print-queue]", error instanceof Error ? error.message : error);
    });
  };
  tick();
  pollTimer = setInterval(tick, 4000);
  console.log("  Fila API: ativa (poll 4s)");
}

export function stopPrintQueuePoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function refreshPrintQueuePoller(enqueuePrint) {
  const base = apiBase();
  const config = loadConfig();
  if (base && config.printerName) {
    startPrintQueuePoller(enqueuePrint);
  } else {
    stopPrintQueuePoller();
    if (!base) {
      console.log("  Fila API: off (configure apiBaseUrl pelo painel)");
    } else if (!config.printerName) {
      console.log("  Fila API: off (defina a impressora no painel)");
    }
  }
}

/**
 * @param {(task: () => Promise<unknown>) => Promise<unknown>} enqueuePrint
 */
async function drainPrintQueue(enqueuePrint) {
  const config = loadConfig();
  if (!apiBase() || !config.printerName || polling) return;
  polling = true;
  const claimedBy = `print-agent:${hostname()}`;
  try {
    /** @type {{ items?: PrintQueueItem[] }} */
    const queue = await apiFetch("/api/orders/print-queue?limit=10");
    const items = Array.isArray(queue?.items) ? queue.items : [];
    for (const item of items) {
      if (!item?.id) continue;
      let order = null;
      try {
        order = await apiFetch(`/api/orders/${item.id}/print-claim`, {
          method: "POST",
          body: JSON.stringify({ claimedBy }),
        });
      } catch {
        continue;
      }
      if (!order?.code) continue;

      try {
        let store = null;
        try {
          store = await apiFetch("/api/store");
        } catch {
          store = null;
        }
        const columns = config.columns;
        const buffer = buildReceiptEscPos({
          store: store
            ? {
                name: store.name,
                legalName: store.legalName,
                cnpj: store.cnpj,
                receiptFooter: store.receiptFooter,
              }
            : undefined,
          order,
          columns,
        });
        await enqueuePrint(async () => {
          await rawPrintWindows(config.printerName, buffer);
        });
        await apiFetch(`/api/orders/${item.id}/print-complete`, {
          method: "POST",
          body: JSON.stringify({ claimedBy }),
        });
        console.log(`[print-queue] Pedido #${order.code} impresso`);
      } catch (error) {
        console.error(
          `[print-queue] Falha #${order.code}:`,
          error instanceof Error ? error.message : error,
        );
        try {
          await apiFetch(`/api/orders/${item.id}/print-fail`, {
            method: "POST",
            body: JSON.stringify({ claimedBy }),
          });
        } catch {
          // ignore
        }
      }
    }
  } finally {
    polling = false;
  }
}

/** Persistido pelo painel ao conectar o agente. */
export function setApiBaseUrl(url) {
  const next = String(url || "").trim().replace(/\/$/, "");
  saveConfig({ apiBaseUrl: next });
  return next;
}
