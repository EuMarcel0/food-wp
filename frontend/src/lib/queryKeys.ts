import type { Order } from "../types";

export const queryKeys = {
  health: ["health"] as const,
  store: ["store"] as const,
  stats: ["orders", "stats"] as const,
  categories: {
    all: ["categories"] as const,
    options: ["categories", "options"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string; active?: boolean },
    ) => ["categories", "list", page, limit, filters] as const,
  },
  products: {
    all: ["products"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string; categoryId?: string; active?: boolean },
    ) => ["products", "list", page, limit, filters] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string; status?: string; fulfillment?: string },
    ) => ["orders", "list", page, limit, filters] as const,
  },
};

export type OrderListFilters = {
  q?: string;
  status?: Order["status"];
  fulfillment?: Order["fulfillment"];
};
