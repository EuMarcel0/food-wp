const CACHE_MS = 60 * 60 * 1000;
/** Se todas as fontes falharem, reaproveita a última cotação válida por até 3 dias. */
const STALE_MAX_MS = 3 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export type UsdBrlRate = { rate: number; updatedAt: string; source: string };

type Provider = { name: string; fetchRate: () => Promise<UsdBrlRate> };

let cache: { at: number; value: UsdBrlRate } | null = null;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "food-wp-bot/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function validRate(rate: unknown) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) throw new Error("cotação inválida");
  return value;
}

/** PTAX formato MM-DD-YYYY. */
function ptaxDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${date.getFullYear()}`;
}

const PROVIDERS: Provider[] = [
  {
    // Cotação oficial do Banco Central; busca 7 dias para cobrir fim de semana e feriado.
    name: "Banco Central (PTAX)",
    fetchRate: async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      const url =
        "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
        "CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)" +
        `?@i='${ptaxDate(start)}'&@f='${ptaxDate(end)}'` +
        "&$top=1&$orderby=dataHoraCotacao%20desc&$format=json";
      const data = await getJson<{ value?: { cotacaoVenda?: number; dataHoraCotacao?: string }[] }>(url);
      const last = data.value?.[0];
      return {
        rate: validRate(last?.cotacaoVenda),
        updatedAt: last?.dataHoraCotacao ?? new Date().toISOString(),
        source: "Banco Central (PTAX)",
      };
    },
  },
  {
    name: "ExchangeRate-API",
    fetchRate: async () => {
      const data = await getJson<{ result?: string; rates?: Record<string, number>; time_last_update_utc?: string }>(
        "https://open.er-api.com/v6/latest/USD",
      );
      if (data.result !== "success") throw new Error("resposta sem sucesso");
      return {
        rate: validRate(data.rates?.BRL),
        updatedAt: data.time_last_update_utc ?? new Date().toISOString(),
        source: "ExchangeRate-API",
      };
    },
  },
  {
    name: "AwesomeAPI",
    fetchRate: async () => {
      const data = await getJson<{ USDBRL?: { ask?: string; create_date?: string } }>(
        "https://economia.awesomeapi.com.br/json/last/USD-BRL",
      );
      return {
        rate: validRate(data.USDBRL?.ask),
        updatedAt: data.USDBRL?.create_date ?? new Date().toISOString(),
        source: "AwesomeAPI",
      };
    },
  },
];

/** Cotação do dólar (venda) com cache de 1 hora e fontes alternativas. */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const failures: string[] = [];
  for (const provider of PROVIDERS) {
    try {
      const value = await provider.fetchRate();
      cache = { at: Date.now(), value };
      return value;
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : "falha"}`);
    }
  }

  console.warn(`[fx] cotação indisponível em todas as fontes — ${failures.join("; ")}`);
  if (cache && Date.now() - cache.at < STALE_MAX_MS) return cache.value;
  throw new Error(`Cotação indisponível (${failures.join("; ")}).`);
}
