import { env } from "../config/env.js";

const BASE_URL = "https://api.openai.com/v1/organization";
const CACHE_MS = 5 * 60 * 1000;
const MAX_PAGES = 4;

export type OpenAiUsageDay = {
  date: string;
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export type OpenAiUsageModel = {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export type OpenAiUsageReport = {
  configured: boolean;
  projectId: string | null;
  from: string;
  to: string;
  currency: string;
  totalCost: number;
  todayCost: number;
  totals: { requests: number; inputTokens: number; outputTokens: number };
  days: OpenAiUsageDay[];
  models: OpenAiUsageModel[];
  fetchedAt: string;
};

type Bucket<T> = { start_time: number; end_time: number; results: T[] };
type Page<T> = { data?: Bucket<T>[]; has_more?: boolean; next_page?: string | null };

type CostResult = { amount?: { value?: number; currency?: string } };
type CompletionResult = {
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  num_model_requests?: number;
};

let cache: { key: string; at: number; report: OpenAiUsageReport } | null = null;

export function isOpenAiAdminConfigured() {
  return Boolean(env.openaiAdminKey && !env.openaiAdminKey.startsWith("your-"));
}

async function fetchBuckets<T>(path: string, params: Record<string, string | string[]>) {
  const buckets: Bucket<T>[] = [];
  let page: string | undefined;
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    }
    if (page) query.set("page", page);
    const response = await fetch(`${BASE_URL}${path}?${query}`, {
      headers: { Authorization: `Bearer ${env.openaiAdminKey}` },
    });
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Admin key da OpenAI inválida ou sem permissão (use uma chave sk-admin-...).");
      }
      throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text) as Page<T>;
    buckets.push(...(data.data ?? []));
    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }
  return buckets;
}

function dayKey(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Consumo do mês corrente (UTC, igual ao painel da OpenAI). */
export async function getOpenAiUsageReport(force = false): Promise<OpenAiUsageReport> {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  const projectId = env.openaiProjectId || null;
  const empty: OpenAiUsageReport = {
    configured: false,
    projectId,
    from: dayKey(monthStart),
    to: now.toISOString().slice(0, 10),
    currency: "usd",
    totalCost: 0,
    todayCost: 0,
    totals: { requests: 0, inputTokens: 0, outputTokens: 0 },
    days: [],
    models: [],
    fetchedAt: now.toISOString(),
  };
  if (!isOpenAiAdminConfigured()) return empty;

  const cacheKey = `${monthStart}:${projectId ?? ""}`;
  if (!force && cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_MS) return cache.report;

  const common: Record<string, string | string[]> = {
    start_time: String(monthStart),
    bucket_width: "1d",
    limit: "31",
    ...(projectId ? { project_ids: [projectId] } : {}),
  };
  const [costBuckets, usageBuckets] = await Promise.all([
    fetchBuckets<CostResult>("/costs", common),
    fetchBuckets<CompletionResult>("/usage/completions", { ...common, group_by: ["model"] }),
  ]);

  const days = new Map<string, OpenAiUsageDay>();
  const dayOf = (start: number) => {
    const date = dayKey(start);
    const current = days.get(date) ?? { date, cost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
    days.set(date, current);
    return current;
  };

  let currency = "usd";
  for (const bucket of costBuckets) {
    const day = dayOf(bucket.start_time);
    for (const result of bucket.results ?? []) {
      day.cost += Number(result.amount?.value ?? 0);
      if (result.amount?.currency) currency = result.amount.currency;
    }
  }

  const models = new Map<string, OpenAiUsageModel>();
  for (const bucket of usageBuckets) {
    const day = dayOf(bucket.start_time);
    for (const result of bucket.results ?? []) {
      const requests = result.num_model_requests ?? 0;
      const input = result.input_tokens ?? 0;
      const output = result.output_tokens ?? 0;
      day.requests += requests;
      day.inputTokens += input;
      day.outputTokens += output;
      const name = result.model || "outros";
      const model = models.get(name) ?? { model: name, requests: 0, inputTokens: 0, outputTokens: 0 };
      model.requests += requests;
      model.inputTokens += input;
      model.outputTokens += output;
      models.set(name, model);
    }
  }

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const today = now.toISOString().slice(0, 10);
  const report: OpenAiUsageReport = {
    ...empty,
    configured: true,
    currency,
    totalCost: dayList.reduce((sum, day) => sum + day.cost, 0),
    todayCost: days.get(today)?.cost ?? 0,
    totals: {
      requests: dayList.reduce((sum, day) => sum + day.requests, 0),
      inputTokens: dayList.reduce((sum, day) => sum + day.inputTokens, 0),
      outputTokens: dayList.reduce((sum, day) => sum + day.outputTokens, 0),
    },
    days: dayList,
    models: [...models.values()].sort((a, b) => b.requests - a.requests),
  };
  cache = { key: cacheKey, at: Date.now(), report };
  return report;
}
