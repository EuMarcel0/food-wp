const USD_BRL_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL";
const CACHE_MS = 60 * 60 * 1000;

export type UsdBrlRate = { rate: number; updatedAt: string; source: string };

let cache: { at: number; value: UsdBrlRate } | null = null;

/** Cotação comercial do dólar (venda), com cache de 1 hora. */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const response = await fetch(USD_BRL_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Cotação indisponível (${response.status}).`);
  const data = (await response.json()) as { USDBRL?: { ask?: string; create_date?: string } };
  const rate = Number(data.USDBRL?.ask);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Cotação do dólar inválida.");
  const value: UsdBrlRate = {
    rate,
    updatedAt: data.USDBRL?.create_date ?? new Date().toISOString(),
    source: "AwesomeAPI",
  };
  cache = { at: Date.now(), value };
  return value;
}
