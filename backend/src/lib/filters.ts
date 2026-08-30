export type ProductFilter = {
  q?: string;
  categoryId?: string;
  active?: boolean;
};

export type CategoryFilter = {
  q?: string;
  active?: boolean;
};

export type OrderFilter = {
  q?: string;
  status?: string;
  fulfillment?: string;
  /** Início inclusivo (ISO), filtrando por created_at */
  createdFrom?: string;
  /** Fim inclusivo (ISO), filtrando por created_at */
  createdTo?: string;
};

/** Aceita YYYY-MM-DD e interpreta o dia no fuso America/Sao_Paulo. */
export function parseDateDay(value: unknown, endOfDay = false) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const time = endOfDay ? "T23:59:59.999-03:00" : "T00:00:00.000-03:00";
  const ms = Date.parse(`${raw}${time}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function parseSearch(value: unknown) {
  const q = String(value ?? "")
    .trim()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ");
  return q || undefined;
}

export function parseOptionalBoolean(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return undefined;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

export function parseOptionalText(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || undefined;
}
