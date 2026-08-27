import { toast } from "./toast";
import { PAGE_SIZE, type PageResult } from "./pagination";
import { withQuery } from "./query";
import type {
  Addon,
  AppNotification,
  Category,
  Health,
  Order,
  OrderStats,
  OrderStatus,
  Product,
  Store,
} from "../types";

const base = import.meta.env.VITE_API_URL ?? "";

type RequestOptions = RequestInit & { silent?: boolean };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { silent, ...fetchInit } = init;
  const response = await fetch(`${base}${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(fetchInit.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await readError(response);
    if (!silent) toast.error(message);
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function readError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // corpo não é JSON
  }
  return body || `Erro ${response.status}`;
}

export const api = {
  health: () => request<Health>("/health", { silent: true }),
  store: () => request<Store>("/api/store", { silent: true }),
  updateStore: (payload: {
    idleTimeoutMinutes?: number;
    deliveryFeeCents?: number;
    name?: string;
    photo?: { mime: string; data: string };
  }) =>
    request<Store & { whatsappError?: string }>("/api/store", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createNeighborhood: (payload: { name: string; feeCents: number }) =>
    request<Store["neighborhoods"][number]>("/api/store/neighborhoods", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteNeighborhood: (id: string) =>
    request<void>(`/api/store/neighborhoods/${id}`, { method: "DELETE" }),
  categories: (all = false) =>
    request<Category[]>(`/api/categories${all ? "?all=1" : ""}`),
  listCategories: (
    page = 1,
    limit = PAGE_SIZE,
    filters?: { q?: string; active?: boolean },
  ) =>
    request<PageResult<Category>>(
      withQuery("/api/categories", {
        all: 1,
        page,
        limit,
        q: filters?.q,
        active: filters?.active,
      }),
    ),
  createCategory: (payload: {
    name: string;
    sortOrder: number;
    active: boolean;
  }) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCategory: (
    id: string,
    payload: { name: string; sortOrder: number; active: boolean },
  ) =>
    request<Category>(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCategory: (id: string) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),
  addons: (all = false) =>
    request<Addon[]>(`/api/addons${all ? "?all=1" : ""}`),
  listAddons: (
    page = 1,
    limit = PAGE_SIZE,
    filters?: { q?: string; active?: boolean },
  ) =>
    request<PageResult<Addon>>(
      withQuery("/api/addons", {
        all: 1,
        page,
        limit,
        q: filters?.q,
        active: filters?.active,
      }),
    ),
  createAddon: (payload: {
    name: string;
    price: number;
    sortOrder: number;
    active: boolean;
  }) =>
    request<Addon>("/api/addons", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAddon: (
    id: string,
    payload: { name: string; price: number; sortOrder: number; active: boolean },
  ) =>
    request<Addon>(`/api/addons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAddon: (id: string) =>
    request<void>(`/api/addons/${id}`, { method: "DELETE" }),
  products: (
    page = 1,
    limit = PAGE_SIZE,
    filters?: { q?: string; categoryId?: string; active?: boolean },
  ) =>
    request<PageResult<Product>>(
      withQuery("/api/products", {
        page,
        limit,
        q: filters?.q,
        categoryId: filters?.categoryId,
        active: filters?.active,
      }),
    ),
  createProduct: (payload: {
    categoryId: string;
    name: string;
    description: string | null;
    price: number;
    active: boolean;
    customizable: boolean;
    notesEnabled: boolean;
    addonsEnabled: boolean;
    addonIds: string[];
    optionGroups: Product["optionGroups"];
  }) =>
    request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProduct: (
    id: string,
    payload: Partial<{
      categoryId: string;
      name: string;
      description: string | null;
      price: number;
      active: boolean;
      customizable: boolean;
      notesEnabled: boolean;
      addonsEnabled: boolean;
      addonIds: string[];
      optionGroups: Product["optionGroups"];
    }>,
  ) =>
    request<Product>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  orders: (
    page = 1,
    limit = PAGE_SIZE,
    silent = false,
    filters?: { q?: string; status?: string; fulfillment?: string },
  ) =>
    request<PageResult<Order>>(
      withQuery("/api/orders", {
        page,
        limit,
        q: filters?.q,
        status: filters?.status,
        fulfillment: filters?.fulfillment,
      }),
      { silent },
    ),
  orderStats: () => request<OrderStats>("/api/orders/stats"),
  updateOrderStatus: (
    id: string,
    status: OrderStatus,
    actorName?: string,
    prepMinutes?: number,
  ) =>
    request<Order>(`/api/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, actorName, prepMinutes }),
    }),
  notifications: (reader: string, silent = true) =>
    request<AppNotification[]>(
      `/api/notifications?reader=${encodeURIComponent(reader)}`,
      { silent },
    ),
  markNotificationRead: (id: string, reader: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ reader }),
    }),
};
