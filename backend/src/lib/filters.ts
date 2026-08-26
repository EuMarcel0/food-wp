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
};

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
