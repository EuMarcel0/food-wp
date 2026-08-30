import type { Order, Store } from "../types";

const BASE_KEY = "food-wp-print-agent-base";
const TOKEN_KEY = "food-wp-print-agent-token";
const DEFAULT_BASE = "http://127.0.0.1:19100";

export type PrintAgentHealth = {
  ok: boolean;
  service?: string;
  host?: string;
  port?: number;
  printerName?: string | null;
  columns?: number;
};

export type PrintAgentPrinter = {
  name: string;
  isDefault: boolean;
  offline: boolean;
};

export function getPrintAgentBase() {
  try {
    return localStorage.getItem(BASE_KEY)?.trim() || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function getPrintAgentToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setPrintAgentAuth(base: string, token: string) {
  try {
    localStorage.setItem(BASE_KEY, base.replace(/\/$/, ""));
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // storage bloqueado
  }
}

async function readError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // ignore
  }
  return body || `Erro ${response.status}`;
}

export async function fetchPrintAgentHealth(base = getPrintAgentBase()) {
  const response = await fetch(`${base.replace(/\/$/, "")}/health`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as PrintAgentHealth;
}

/** Emparelha o painel com o agente local (só funciona em localhost). */
export async function pairPrintAgent(base = DEFAULT_BASE) {
  const url = `${base.replace(/\/$/, "")}/setup`;
  const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as {
    token: string;
    port: number;
    printerName?: string | null;
  };
  const resolved = `http://127.0.0.1:${data.port || 19100}`;
  setPrintAgentAuth(resolved, data.token);
  return { base: resolved, token: data.token, printerName: data.printerName ?? "" };
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const base = getPrintAgentBase().replace(/\/$/, "");
  const token = getPrintAgentToken();
  if (!token) {
    throw new Error("Agente não conectado. Use Conectar agente em Configurações.");
  }
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function fetchPrintAgentPrinters() {
  return authedFetch("/printers") as Promise<{
    host: string;
    printerName: string | null;
    printers: PrintAgentPrinter[];
  }>;
}

export async function savePrintAgentPrinter(printerName: string) {
  return authedFetch("/config", {
    method: "PUT",
    body: JSON.stringify({ printerName }),
  }) as Promise<{ ok: boolean; printerName: string | null }>;
}

export async function printOrderViaAgent(input: {
  order: Order;
  store?: Store;
  printer?: string;
}) {
  return authedFetch("/print", {
    method: "POST",
    body: JSON.stringify({
      order: input.order,
      store: input.store
        ? {
            name: input.store.name,
            legalName: input.store.legalName,
            cnpj: input.store.cnpj,
            receiptFooter: input.store.receiptFooter,
          }
        : undefined,
      printer: input.printer,
    }),
  }) as Promise<{ ok: boolean; printer: string; bytes: number }>;
}
