import { env } from "../config/env.js";
import { rememberReport, resolveUsageRange } from "./usageMonth.js";

const CACHE_MS = 5 * 60 * 1000;
const MAX_PAGES = 5;

export type MetaUsageDay = {
  date: string;
  volume: number;
  paidVolume: number;
  cost: number;
  sent: number;
  received: number;
};

/** Mesmos números de "All Messages" no WhatsApp Manager. */
export type MetaMessageTotals = { sent: number; delivered: number; received: number };

export type MetaUsageCategory = {
  /** SERVICE, MARKETING, UTILITY, AUTHENTICATION… */
  category: string;
  volume: number;
  freeVolume: number;
  paidVolume: number;
  cost: number;
};

export type MetaUsageReport = {
  configured: boolean;
  from: string;
  to: string;
  currency: string;
  totalCost: number;
  totals: { volume: number; freeVolume: number; paidVolume: number };
  /** null se a Meta não devolveu o analytics de mensagens. */
  messages: MetaMessageTotals | null;
  days: MetaUsageDay[];
  categories: MetaUsageCategory[];
  fetchedAt: string;
};

type DataPoint = {
  start: number;
  end: number;
  volume?: number;
  cost?: number;
  pricing_type?: string;
  pricing_category?: string;
};

type PricingAnalytics = {
  data?: { data_points?: DataPoint[] }[];
  paging?: { next?: string };
};

type MessagingAnalytics = {
  analytics?: { data_points?: { start: number; end?: number; sent?: number; delivered?: number }[] };
};

/** product_types da Meta: 0 = template, 2 = mensagem comum (enviadas), 100 = recebidas do cliente. */
const OUTBOUND_TYPES = "[0,2]";
const INBOUND_TYPES = "[100]";

const cache = new Map<string, { at: number; report: MetaUsageReport }>();

function isConfigured() {
  const token = env.whatsappToken;
  return Boolean(token && !token.startsWith("your-") && env.whatsappWabaId);
}

async function graphGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.whatsappToken}` } });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // resposta não-JSON
    }
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      throw new Error(
        `Meta recusou a consulta (${response.status}): ${message}. ` +
          "O token precisa da permissão whatsapp_business_management e o WHATSAPP_WABA_ID deve estar correto.",
      );
    }
    throw new Error(`Meta ${response.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

/** Consumo no período na WhatsApp Business Platform (valores aproximados da Meta); padrão: mês corrente. */
export async function getMetaUsageReport(
  range: { from?: unknown; to?: unknown; previousMonth?: boolean } = {},
  force = false,
): Promise<MetaUsageReport> {
  const now = new Date();
  const month = await resolveUsageRange(range, now);
  const monthStart = month.startSeconds;
  const dayKey = month.dayKey;
  const nowSeconds = month.endSeconds;
  const empty: MetaUsageReport = {
    configured: false,
    from: month.from,
    to: month.to,
    currency: "BRL",
    totalCost: 0,
    totals: { volume: 0, freeVolume: 0, paidVolume: 0 },
    messages: null,
    days: [],
    categories: [],
    fetchedAt: now.toISOString(),
  };
  if (!isConfigured()) return empty;

  const cacheKey = `${month.from}:${month.to}:${env.whatsappWabaId}`;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.report;

  const field =
    `pricing_analytics.start(${monthStart}).end(${nowSeconds}).granularity(DAILY)` +
    ".metric_types([COST,VOLUME]).dimensions(PRICING_CATEGORY,PRICING_TYPE)";
  const base = `https://graph.facebook.com/${env.whatsappGraphVersion}/${env.whatsappWabaId}`;
  const messaging = (productTypes: string) =>
    graphGet<MessagingAnalytics>(
      `${base}?fields=${encodeURIComponent(
        `analytics.start(${monthStart}).end(${nowSeconds}).granularity(DAY).product_types(${productTypes})`,
      )}`,
    ).catch((error) => {
      console.warn("[meta] analytics de mensagens indisponível:", error instanceof Error ? error.message : error);
      return null;
    });
  const [first, outbound, inbound] = await Promise.all([
    graphGet<{ currency?: string; pricing_analytics?: PricingAnalytics }>(
      `${base}?fields=${encodeURIComponent(`currency,${field}`)}`,
    ),
    messaging(OUTBOUND_TYPES),
    messaging(INBOUND_TYPES),
  ]);

  const points: DataPoint[] = [];
  let page: PricingAnalytics | undefined = first.pricing_analytics;
  for (let index = 0; page && index < MAX_PAGES; index += 1) {
    for (const group of page.data ?? []) points.push(...(group.data_points ?? []));
    page = page.paging?.next ? await graphGet<PricingAnalytics>(page.paging.next) : undefined;
  }

  const days = new Map<string, MetaUsageDay>();
  const dayOf = (start: number, end?: number) => {
    const date = dayKey(start, end);
    const day = days.get(date) ?? { date, volume: 0, paidVolume: 0, cost: 0, sent: 0, received: 0 };
    days.set(date, day);
    return day;
  };

  let messages: MetaMessageTotals | null = null;
  if (outbound || inbound) {
    messages = { sent: 0, delivered: 0, received: 0 };
    for (const point of outbound?.analytics?.data_points ?? []) {
      const sent = Number(point.sent ?? 0);
      messages.sent += sent;
      messages.delivered += Number(point.delivered ?? 0);
      dayOf(point.start, point.end).sent += sent;
    }
    for (const point of inbound?.analytics?.data_points ?? []) {
      const received = Number(point.sent ?? point.delivered ?? 0);
      messages.received += received;
      dayOf(point.start, point.end).received += received;
    }
  }

  const categories = new Map<string, MetaUsageCategory>();
  for (const point of points) {
    const volume = Number(point.volume ?? 0);
    const cost = Number(point.cost ?? 0);
    const free = (point.pricing_type ?? "").startsWith("FREE");
    const day = dayOf(point.start, point.end);
    day.volume += volume;
    day.cost += cost;
    if (!free) day.paidVolume += volume;

    const name = point.pricing_category || "OUTROS";
    const category = categories.get(name) ?? { category: name, volume: 0, freeVolume: 0, paidVolume: 0, cost: 0 };
    category.volume += volume;
    category.cost += cost;
    if (free) category.freeVolume += volume;
    else category.paidVolume += volume;
    categories.set(name, category);
  }

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const categoryList = [...categories.values()].sort((a, b) => b.volume - a.volume);
  const report: MetaUsageReport = {
    ...empty,
    configured: true,
    currency: (first.currency || "BRL").toUpperCase(),
    totalCost: dayList.reduce((sum, day) => sum + day.cost, 0),
    totals: {
      volume: categoryList.reduce((sum, item) => sum + item.volume, 0),
      freeVolume: categoryList.reduce((sum, item) => sum + item.freeVolume, 0),
      paidVolume: categoryList.reduce((sum, item) => sum + item.paidVolume, 0),
    },
    messages,
    days: dayList,
    categories: categoryList,
  };
  rememberReport(cache, cacheKey, report);
  return report;
}
