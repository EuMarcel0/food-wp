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
  addons: {
    all: ["addons"] as const,
    options: ["addons", "options"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string; active?: boolean },
    ) => ["addons", "list", page, limit, filters] as const,
  },
  crusts: {
    all: ["crusts"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string },
    ) => ["crusts", "list", page, limit, filters] as const,
  },
  sizes: {
    all: ["sizes"] as const,
    options: ["sizes", "options"] as const,
    list: (
      page: number,
      limit: number,
      filters: { q?: string },
    ) => ["sizes", "list", page, limit, filters] as const,
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
      filters: {
        q?: string;
        status?: string;
        fulfillment?: string;
        from?: string;
        to?: string;
      },
    ) => ["orders", "list", page, limit, filters] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    live: ["conversations", "live"] as const,
    history: ["conversations", "history"] as const,
  },
};

export type OrderListFilters = {
  q?: string;
  status?: Order["status"];
  fulfillment?: Order["fulfillment"];
  from?: string;
  to?: string;
};
