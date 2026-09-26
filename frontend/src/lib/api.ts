import { toast } from "./toast";
import { PAGE_SIZE, type PageResult } from "./pagination";
import { withQuery } from "./query";
import type {
  Addon,
  Category,
  ConversationHistoryPage,
  ConversationMessage,
  ConversationMessagesPage,
  Crust,
  Health,
  LiveConversation,
  NotificationsPage,
  Order,
  OrderLog,
  OrderStats,
  OrderStatus,
  Product,
  Size,
  Store,
  StorePaymentMethod,
  SalesByPaymentReport,
} from "../types";

const base = import.meta.env.VITE_API_URL ?? "";

type RequestOptions = RequestInit & { silent?: boolean };

function normalizeConversationListPage<T extends { id: string }>(
  data: unknown,
): {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
} {
  if (Array.isArray(data)) {
    return {
      items: data as T[],
      hasMore: false,
      nextOffset: null,
      total: data.length,
    };
  }
  if (data && typeof data === "object") {
    const row = data as {
      items?: unknown;
      hasMore?: unknown;
      nextOffset?: unknown;
      total?: unknown;
    };
    if (Array.isArray(row.items)) {
      const items = row.items as T[];
      return {
        items,
        hasMore: Boolean(row.hasMore),
        nextOffset:
          typeof row.nextOffset === "number" ? row.nextOffset : null,
        total: typeof row.total === "number" ? row.total : items.length,
      };
    }
  }
  return { items: [], hasMore: false, nextOffset: null, total: 0 };
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { silent, ...fetchInit } = init;
  const response = await fetch(`${base}${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(fetchInit.headers ?? {})
    }
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
    legalName?: string | null;
    cnpj?: string | null;
    receiptFooter?: string | null;
    businessHours?: Store["businessHours"];
    defaultAcceptMinutes?: number;
    autoAcceptOrders?: boolean;
    allowCustomerCancel?: boolean;
    batchCategoryIds?: string[];
  }) =>
    request<Store & { whatsappError?: string }>("/api/store", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createNeighborhood: (payload: { name: string; feeCents: number }) =>
    request<Store["neighborhoods"][number]>("/api/store/neighborhoods", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateNeighborhood: (
    id: string,
    payload: { name: string; feeCents: number },
  ) =>
    request<Store["neighborhoods"][number]>(`/api/store/neighborhoods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteNeighborhood: (id: string) => request<void>(`/api/store/neighborhoods/${id}`, { method: "DELETE" }),
  categories: (all = false) => request<Category[]>(`/api/categories${all ? "?all=1" : ""}`),
  listCategories: (page = 1, limit = PAGE_SIZE, filters?: { q?: string; active?: boolean }) =>
    request<PageResult<Category>>(
      withQuery("/api/categories", {
        all: 1,
        page,
        limit,
        q: filters?.q,
        active: filters?.active
      })
    ),
  createCategory: (payload: { name: string; sortOrder: number; active: boolean }) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCategory: (id: string, payload: { name: string; sortOrder: number; active: boolean }) =>
    request<Category>(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteCategory: (id: string) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),
  addons: (all = false) => request<Addon[]>(`/api/addons${all ? "?all=1" : ""}`),
  listAddons: (page = 1, limit = PAGE_SIZE, filters?: { q?: string; active?: boolean }) =>
    request<PageResult<Addon>>(
      withQuery("/api/addons", {
        all: 1,
        page,
        limit,
        q: filters?.q,
        active: filters?.active
      })
    ),
  createAddon: (payload: { name: string; price: number; sortOrder: number; active: boolean }) =>
    request<Addon>("/api/addons", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateAddon: (id: string, payload: { name: string; price: number; sortOrder: number; active: boolean }) =>
    request<Addon>(`/api/addons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteAddon: (id: string) => request<void>(`/api/addons/${id}`, { method: "DELETE" }),
  listCrusts: (page = 1, limit = PAGE_SIZE, filters?: { q?: string }) =>
    request<PageResult<Crust>>(
      withQuery("/api/crusts", {
        all: 1,
        page,
        limit,
        q: filters?.q
      })
    ),
  createCrust: (payload: {
    name: string;
    addsPrice: boolean;
    price: number;
    pizzaKind: Crust["pizzaKind"];
  }) =>
    request<Crust>("/api/crusts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCrust: (
    id: string,
    payload: {
      name: string;
      addsPrice: boolean;
      price: number;
      pizzaKind: Crust["pizzaKind"];
    }
  ) =>
    request<Crust>(`/api/crusts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteCrust: (id: string) => request<void>(`/api/crusts/${id}`, { method: "DELETE" }),
  sizes: (activeOnly = true) => request<Size[]>(activeOnly ? "/api/sizes" : withQuery("/api/sizes", { all: 1 })),
  listSizes: (page = 1, limit = PAGE_SIZE, filters?: { q?: string }) =>
    request<PageResult<Size>>(
      withQuery("/api/sizes", {
        all: 1,
        page,
        limit,
        q: filters?.q
      })
    ),
  createSize: (payload: { name: string; price: number; maxSelect: number; priceMode: "addon" | "replace" }) =>
    request<Size>("/api/sizes", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateSize: (
    id: string,
    payload: {
      name: string;
      price: number;
      maxSelect: number;
      priceMode: "addon" | "replace";
    }
  ) =>
    request<Size>(`/api/sizes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteSize: (id: string) => request<void>(`/api/sizes/${id}`, { method: "DELETE" }),
  listPaymentMethods: (
    page = 1,
    limit = PAGE_SIZE,
    filters?: { q?: string; active?: boolean },
  ) =>
    request<PageResult<StorePaymentMethod>>(
      withQuery("/api/payment-methods", {
        all: 1,
        page,
        limit,
        q: filters?.q,
        active: filters?.active,
      }),
    ),
  createPaymentMethod: (payload: {
    name: string;
    kind: StorePaymentMethod["kind"];
    active: boolean;
  }) =>
    request<StorePaymentMethod>("/api/payment-methods", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePaymentMethod: (
    id: string,
    payload: {
      name: string;
      kind: StorePaymentMethod["kind"];
      active: boolean;
    },
  ) =>
    request<StorePaymentMethod>(`/api/payment-methods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePaymentMethod: (id: string) =>
    request<void>(`/api/payment-methods/${id}`, { method: "DELETE" }),
  products: (page = 1, limit = PAGE_SIZE, filters?: { q?: string; categoryId?: string; active?: boolean }) =>
    request<PageResult<Product>>(
      withQuery("/api/products", {
        page,
        limit,
        q: filters?.q,
        categoryId: filters?.categoryId,
        active: filters?.active
      })
    ),
  createProduct: (payload: {
    categoryId: string;
    name: string;
    description: string | null;
    price: number;
    active: boolean;
    customizable: boolean;
    pizzaKind: Product["pizzaKind"];
    notesEnabled: boolean;
    addonsEnabled: boolean;
    crustsEnabled: boolean;
    quantityEnabled: boolean;
    addonIds: string[];
    optionGroups: Product["optionGroups"];
  }) =>
    request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  reorderProducts: (categoryId: string, orderedIds: string[]) =>
    request<PageResult<Product>>("/api/products/reorder", {
      method: "PUT",
      body: JSON.stringify({ categoryId, orderedIds }),
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
      pizzaKind: Product["pizzaKind"];
      notesEnabled: boolean;
      addonsEnabled: boolean;
      crustsEnabled: boolean;
      quantityEnabled: boolean;
      addonIds: string[];
      optionGroups: Product["optionGroups"];
    }>
  ) =>
    request<Product>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  orders: (
    page = 1,
    limit = PAGE_SIZE,
    silent = false,
    filters?: {
      q?: string;
      status?: string;
      fulfillment?: string;
      lifecycle?: "active" | "cancelled";
      from?: string;
      to?: string;
    }
  ) =>
    request<PageResult<Order>>(
      withQuery("/api/orders", {
        page,
        limit,
        q: filters?.q,
        status: filters?.status,
        fulfillment: filters?.fulfillment,
        lifecycle: filters?.lifecycle,
        from: filters?.from,
        to: filters?.to
      }),
      { silent }
    ),
  orderStats: (day?: string) =>
    request<OrderStats>(withQuery("/api/orders/stats", { day })),
  salesByPaymentReport: (
    filters: {
      from?: string;
      to?: string;
      paymentMethods?: string[];
    },
    silent = false,
  ) =>
    request<SalesByPaymentReport>(
      withQuery("/api/orders/reports/sales-by-payment", {
        from: filters.from,
        to: filters.to,
        paymentMethods: filters.paymentMethods?.length
          ? filters.paymentMethods.join(",")
          : undefined,
      }),
      { silent },
    ),
  order: (id: string, silent = false) => request<Order>(`/api/orders/${id}`, { silent }),
  orderPrintQueue: (silent = true) =>
    request<{ items: { id: string; code: string; requestedAt: string }[] }>(
      "/api/orders/print-queue",
      { silent },
    ),
  claimOrderPrint: (id: string, claimedBy: string, silent = true) =>
    request<Order>(`/api/orders/${id}/print-claim`, {
      method: "POST",
      body: JSON.stringify({ claimedBy }),
      silent,
    }),
  completeOrderPrint: (id: string, claimedBy: string, silent = true) =>
    request<Order>(`/api/orders/${id}/print-complete`, {
      method: "POST",
      body: JSON.stringify({ claimedBy }),
      silent,
    }),
  failOrderPrint: (id: string, claimedBy: string, silent = true) =>
    request<{ ok: boolean }>(`/api/orders/${id}/print-fail`, {
      method: "POST",
      body: JSON.stringify({ claimedBy }),
      silent,
    }),
  conversations: async (
    silent = true,
    options: { limit?: number; offset?: number } = {},
  ) =>
    normalizeConversationListPage<LiveConversation>(
      await request<unknown>(
        withQuery("/api/conversations", {
          tab: "active",
          limit: options.limit,
          offset: options.offset,
        }),
        { silent },
      ),
    ),
  conversationHistory: async (
    silent = true,
    options: { limit?: number; offset?: number } = {},
  ) =>
    normalizeConversationListPage(
      await request<unknown>(
        withQuery("/api/conversations", {
          tab: "history",
          limit: options.limit,
          offset: options.offset,
        }),
        { silent },
      ),
    ) as ConversationHistoryPage,
  conversationMessages: (
    id: string,
    options: {
      silent?: boolean;
      limit?: number;
      beforeAt?: string;
      beforeId?: string;
    } = {},
  ) => {
    const { silent = true, limit = 40, beforeAt, beforeId } = options;
    return request<ConversationMessagesPage>(
      withQuery(`/api/conversations/${id}/messages`, {
        limit,
        beforeAt,
        beforeId,
      }),
      { silent },
    );
  },
  sendConversationMessage: (id: string, text: string, by?: string) =>
    request<{
      conversation: LiveConversation;
      message: ConversationMessage | null;
    }>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, by }),
    }),
  takeoverConversation: (id: string, by?: string) =>
    request<unknown>(`/api/conversations/${id}/takeover`, {
      method: "POST",
      body: JSON.stringify({ by })
    }),
  releaseConversation: (id: string) =>
    request<unknown>(`/api/conversations/${id}/release`, {
      method: "POST"
    }),
  closeConversation: (id: string) =>
    request<unknown>(`/api/conversations/${id}/close`, {
      method: "POST",
    }),
  closeAllConversations: () =>
    request<{ closed: number; failed: number; total: number }>(
      "/api/conversations/close-all",
      { method: "POST" },
    ),
  updateOrderStatus: (
    id: string,
    status: OrderStatus,
    actorName?: string,
    prepMinutes?: number,
    cancelReason?: string,
  ) =>
    request<Order>(`/api/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, actorName, prepMinutes, cancelReason })
    }),
  updateOrderPayment: (
    id: string,
    payload: {
      paymentMethod: NonNullable<Order["paymentMethod"]>;
      paymentMethodLabel?: string | null;
      changeForCents?: number | null;
      actorName?: string;
    },
  ) =>
    request<Order>(`/api/orders/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateOrderItems: (
    id: string,
    payload: {
      items: {
        id?: string;
        productId?: string | null;
        name: string;
        quantity: number;
        unitPriceCents: number;
        notes?: string | null;
      }[];
      actorName?: string;
    },
  ) =>
    request<Order>(`/api/orders/${id}/items`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateOrderFulfillment: (
    id: string,
    payload: {
      fulfillment: Order["fulfillment"];
      neighborhoodId?: string | null;
      addressText?: string | null;
      actorName?: string;
    },
  ) =>
    request<Order>(`/api/orders/${id}/fulfillment`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  orderLogs: (id: string) =>
    request<{ items: OrderLog[] }>(`/api/orders/${id}/logs`),
  notifications: (
    reader: string,
    silent = true,
    options: { limit?: number; offset?: number } = {},
  ) =>
    request<NotificationsPage>(
      withQuery("/api/notifications", {
        reader,
        limit: options.limit,
        offset: options.offset,
      }),
      { silent },
    ),
  markNotificationRead: (id: string, reader: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ reader })
    }),
  markAllNotificationsRead: (reader: string) =>
    request<{ ok: boolean; count: number }>("/api/notifications/read-all", {
      method: "PATCH",
      body: JSON.stringify({ reader })
    })
};
