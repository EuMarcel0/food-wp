import type { Order, Store } from "../types";

const BASE_KEY = "food-wp-print-agent-base";
const TOKEN_KEY = "food-wp-print-agent-token";
/** Só o PC da cozinha deve imprimir automaticamente (aceite automático). */
const AUTO_PRINT_STATION_KEY = "food-wp-auto-print-station";
const STATION_ID_KEY = "food-wp-print-station-id";
const DEFAULT_BASE = "http://127.0.0.1:19100";

export type PrintAgentHealth = {
  ok: boolean;
  service?: string;
  host?: string;
  port?: number;
  printerName?: string | null;
  columns?: number;
  apiBaseUrl?: string | null;
  queuePolling?: boolean;
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

/** ID estável desta estação (claim no servidor). */
export function getPrintStationId() {
  try {
    const existing = localStorage.getItem(STATION_ID_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `browser:${crypto.randomUUID()}`
        : `browser:${Date.now().toString(16)}`;
    localStorage.setItem(STATION_ID_KEY, id);
    return id;
  } catch {
    return `browser:${Date.now().toString(16)}`;
  }
}

/** URL da API que o agente deve pollar (sem depender do painel aberto). */
export function resolvePanelApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

export function setPrintAgentAuth(base: string, token: string) {
  try {
    localStorage.setItem(BASE_KEY, base.replace(/\/$/, ""));
    localStorage.setItem(TOKEN_KEY, token.trim());
    // Ao emparelhar, este PC vira a estação de impressão.
    localStorage.setItem(AUTO_PRINT_STATION_KEY, "1");
  } catch {
    // storage bloqueado
  }
}

/** Este navegador/PC deve imprimir no aceite automático? */
export function isAutoPrintStation() {
  try {
    const raw = localStorage.getItem(AUTO_PRINT_STATION_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    // Compat: se já está conectado ao agente e nunca configurou, assume que sim.
    return Boolean(getPrintAgentToken());
  } catch {
    return false;
  }
}

export function setAutoPrintStation(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_PRINT_STATION_KEY, enabled ? "1" : "0");
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
  await pushApiBaseToAgent().catch(() => undefined);
  return {
    base: resolved,
    token: data.token,
    printerName: data.printerName ?? "",
  };
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const base = getPrintAgentBase().replace(/\/$/, "");
  const token = getPrintAgentToken();
  if (!token) {
    throw new Error(
      "Agente não conectado. Use Conectar agente em Configurações.",
    );
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
  const apiBaseUrl = resolvePanelApiBaseUrl();
  return authedFetch("/config", {
    method: "PUT",
    body: JSON.stringify({ printerName, apiBaseUrl }),
  }) as Promise<{
    ok: boolean;
    printerName: string | null;
    apiBaseUrl?: string | null;
    queuePolling?: boolean;
  }>;
}

/** Envia a URL da API ao agente para ele pollar a fila sozinho. */
export async function pushApiBaseToAgent() {
  const apiBaseUrl = resolvePanelApiBaseUrl();
  if (!apiBaseUrl || !getPrintAgentToken()) return null;
  return authedFetch("/config", {
    method: "PUT",
    body: JSON.stringify({ apiBaseUrl }),
  }) as Promise<{
    ok: boolean;
    apiBaseUrl?: string | null;
    queuePolling?: boolean;
  }>;
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
