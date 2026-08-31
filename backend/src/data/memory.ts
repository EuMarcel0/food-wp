import { createOrderCode } from "../lib/money.js";
import type {
  CategoryFilter,
  OrderFilter,
  ProductFilter,
} from "../lib/filters.js";
import { paginateItems } from "../lib/pagination.js";
import { STATUS_LABEL, isAllowedOrderStatus } from "../conversation/status.js";
import { env } from "../config/env.js";
import {
  isOrderFlowState,
  type Addon,
  type AppNotification,
  type Category,
  type Conversation,
  type ConversationContext,
  type ConversationState,
  type Crust,
  type Customer,
  type DeliveryNeighborhood,
  type Fulfillment,
  type NotificationType,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type PizzaKind,
  type Product,
  type ProductOptionGroup,
  type CartSelection,
  type SaveConversationOptions,
  type Size,
  type Store,
  type StorePatch,
} from "../types.js";

const store: Store = {
  id: env.defaultStoreId,
  name: "Estabelecimento Demo",
  segment: "lanches",
  phone: null,
  timezone: "America/Sao_Paulo",
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFeeCents: 700,
  idleTimeoutMinutes: 60,
  defaultAcceptMinutes: 40,
  autoAcceptOrders: false,
  profilePhotoUrl: null,
  legalName: null,
  cnpj: null,
  receiptFooter: null,
  businessHours: null,
  neighborhoods: [],
};

const categories: Category[] = [
  { id: "cat-lanches", name: "Lanches", sortOrder: 1, active: true },
  { id: "cat-acompanhamentos", name: "Acompanhamentos", sortOrder: 2, active: true },
  { id: "cat-bebidas", name: "Bebidas", sortOrder: 3, active: true },
];

const products: Product[] = [
  {
    id: "prod-x-burguer",
    categoryId: "cat-lanches",
    categoryName: "Lanches",
    name: "X-Burguer",
    description: "Pão, carne e queijo",
    price: 22,
    active: true,
    customizable: false,
    pizzaKind: null,
    notesEnabled: false,
    addonsEnabled: false,
    crustsEnabled: false,
    addons: [],
    optionGroups: [],
  },
  {
    id: "prod-x-salada",
    categoryId: "cat-lanches",
    categoryName: "Lanches",
    name: "X-Salada",
    description: "Pão, carne, queijo e salada",
    price: 25,
    active: true,
    customizable: false,
    pizzaKind: null,
    notesEnabled: false,
    addonsEnabled: false,
    crustsEnabled: false,
    addons: [],
    optionGroups: [],
  },
  {
    id: "prod-batata",
    categoryId: "cat-acompanhamentos",
    categoryName: "Acompanhamentos",
    name: "Batata frita",
    description: "Porção média",
    price: 14,
    active: true,
    customizable: false,
    pizzaKind: null,
    notesEnabled: false,
    addonsEnabled: false,
    crustsEnabled: false,
    addons: [],
    optionGroups: [],
  },
  {
    id: "prod-refri",
    categoryId: "cat-bebidas",
    categoryName: "Bebidas",
    name: "Refrigerante lata",
    description: "350ml",
    price: 7,
    active: true,
    customizable: false,
    pizzaKind: null,
    notesEnabled: false,
    addonsEnabled: false,
    crustsEnabled: false,
    addons: [],
    optionGroups: [],
  },
];

const addons: Addon[] = [];
const productAddonIds = new Map<string, string[]>();
const crusts: Crust[] = [
  {
    id: "crust-none",
    name: "Sem Borda",
    addsPrice: false,
    price: 0,
    sortOrder: 0,
    active: true,
    pizzaKind: "salgada",
  },
  {
    id: "crust-cheddar",
    name: "Borda de cheddar",
    addsPrice: false,
    price: 0,
    sortOrder: 1,
    active: true,
    pizzaKind: "salgada",
  },
  {
    id: "crust-catupiry",
    name: "Borda de Catupiry",
    addsPrice: false,
    price: 0,
    sortOrder: 2,
    active: true,
    pizzaKind: "salgada",
  },
  {
    id: "crust-none-doce",
    name: "Sem Borda",
    addsPrice: false,
    price: 0,
    sortOrder: 0,
    active: true,
    pizzaKind: "doce",
  },
  {
    id: "crust-chocolate",
    name: "Borda de chocolate",
    addsPrice: false,
    price: 0,
    sortOrder: 1,
    active: true,
    pizzaKind: "doce",
  },
];

const sizes: Size[] = [
  {
    id: "size-p",
    name: "P - Pequena",
    price: 35,
    maxSelect: 1,
    priceMode: "replace",
    sortOrder: 0,
    active: true,
  },
  {
    id: "size-m",
    name: "M - Média",
    price: 45,
    maxSelect: 1,
    priceMode: "replace",
    sortOrder: 1,
    active: true,
  },
  {
    id: "size-g",
    name: "G - Grande",
    price: 55,
    maxSelect: 2,
    priceMode: "replace",
    sortOrder: 2,
    active: true,
  },
  {
    id: "size-f",
    name: "F - Família",
    price: 75,
    maxSelect: 2,
    priceMode: "replace",
    sortOrder: 3,
    active: true,
  },
];

const customers = new Map<string, Customer>();
const conversations = new Map<string, Conversation>();
const orders = new Map<string, Order>();
const notifications: AppNotification[] = [];
const notificationReads = new Set<string>();

function readKey(notificationId: string, readerKey: string) {
  return `${notificationId}::${readerKey}`;
}

function phoneKey(phone: string) {
  return phone.replace(/\D/g, "");
}

export const memoryStore = {
  getStore() {
    return store;
  },

  updateStore(patch: StorePatch) {
    if (patch.idleTimeoutMinutes !== undefined) {
      store.idleTimeoutMinutes = Math.min(
        10080,
        Math.max(1, Math.round(patch.idleTimeoutMinutes)),
      );
    }
    if (patch.deliveryFeeCents !== undefined) {
      store.deliveryFeeCents = Math.max(0, Math.round(patch.deliveryFeeCents));
    }
    if (patch.name !== undefined) store.name = patch.name;
    if (patch.profilePhotoUrl !== undefined) store.profilePhotoUrl = patch.profilePhotoUrl;
    if (patch.legalName !== undefined) store.legalName = patch.legalName;
    if (patch.cnpj !== undefined) store.cnpj = patch.cnpj;
    if (patch.receiptFooter !== undefined) store.receiptFooter = patch.receiptFooter;
    if (patch.businessHours !== undefined) store.businessHours = patch.businessHours;
    if (patch.defaultAcceptMinutes !== undefined) {
      store.defaultAcceptMinutes = Math.min(
        480,
        Math.max(1, Math.round(patch.defaultAcceptMinutes)),
      );
    }
    if (patch.autoAcceptOrders !== undefined) {
      store.autoAcceptOrders = Boolean(patch.autoAcceptOrders);
    }
    return store;
  },

  listNeighborhoods() {
    return [...store.neighborhoods].sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR"),
    );
  },

  createNeighborhood(input: { name: string; feeCents: number }): DeliveryNeighborhood {
    const name = input.name.trim();
    const exists = store.neighborhoods.some(
      (item) =>
        item.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (exists) throw new Error("Esse bairro já está cadastrado.");
    const neighborhood: DeliveryNeighborhood = {
      id: `nbh-${Date.now()}`,
      name,
      feeCents: Math.max(0, Math.round(input.feeCents)),
    };
    store.neighborhoods.push(neighborhood);
    return neighborhood;
  },

  deleteNeighborhood(id: string) {
    store.neighborhoods = store.neighborhoods.filter((item) => item.id !== id);
  },

  listProducts() {
    return products.filter((product) => product.active);
  },

  listAllProducts() {
    return [...products];
  },

  listProductsPage(page: number, limit: number, filter: ProductFilter = {}) {
    const query = filter.q?.toLowerCase();
    const items = [...products]
      .filter((product) => {
        if (filter.categoryId && product.categoryId !== filter.categoryId) {
          return false;
        }
        if (filter.active !== undefined && product.active !== filter.active) {
          return false;
        }
        if (!query) return true;
        return (
          product.name.toLowerCase().includes(query) ||
          (product.description ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return paginateItems(items, page, limit);
  },

  listCategories() {
    return categories.filter((category) => category.active);
  },

  listAllCategories() {
    return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  listCategoriesPage(
    page: number,
    limit: number,
    all = true,
    filter: CategoryFilter = {},
  ) {
    const query = filter.q?.toLowerCase();
    const items = (all ? [...categories] : this.listCategories())
      .filter((category) => {
        if (filter.active !== undefined && category.active !== filter.active) {
          return false;
        }
        if (!query) return true;
        return category.name.toLowerCase().includes(query);
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"),
      );
    return paginateItems(items, page, limit);
  },

  createCategory(input: { name: string; sortOrder: number; active: boolean }) {
    const category: Category = {
      id: `cat-${Date.now()}`,
      name: input.name,
      sortOrder: input.sortOrder,
      active: input.active,
    };
    categories.push(category);
    return category;
  },

  updateCategory(
    id: string,
    input: { name: string; sortOrder: number; active: boolean },
  ) {
    const category = categories.find((item) => item.id === id);
    if (!category) return null;
    category.name = input.name;
    category.sortOrder = input.sortOrder;
    category.active = input.active;
    return category;
  },

  deleteCategory(id: string) {
    const used = products.some((product) => product.categoryId === id);
    if (used) {
      throw new Error("Há itens do cardápio nesta categoria. Mova ou exclua-os primeiro.");
    }
    const index = categories.findIndex((item) => item.id === id);
    if (index < 0) return false;
    categories.splice(index, 1);
    return true;
  },

  listAddons() {
    return addons.filter((item) => item.active);
  },

  listAllAddons() {
    return [...addons].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"),
    );
  },

  listAddonsPage(
    page: number,
    limit: number,
    all: boolean,
    filter: { q?: string; active?: boolean } = {},
  ) {
    const items = (all ? [...addons] : this.listAddons())
      .filter((item) => {
        if (filter.active !== undefined && item.active !== filter.active) return false;
        if (filter.q && !item.name.toLowerCase().includes(filter.q.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"),
      );
    return paginateItems(items, page, limit);
  },

  createAddon(input: {
    name: string;
    price: number;
    sortOrder: number;
    active: boolean;
  }) {
    const addon: Addon = {
      id: `addon-${Date.now()}`,
      name: input.name,
      price: input.price,
      sortOrder: input.sortOrder,
      active: input.active,
    };
    addons.push(addon);
    return addon;
  },

  updateAddon(
    id: string,
    input: { name: string; price: number; sortOrder: number; active: boolean },
  ) {
    const addon = addons.find((item) => item.id === id);
    if (!addon) return null;
    addon.name = input.name;
    addon.price = input.price;
    addon.sortOrder = input.sortOrder;
    addon.active = input.active;
    return addon;
  },

  deleteAddon(id: string) {
    const index = addons.findIndex((item) => item.id === id);
    if (index < 0) return false;
    addons.splice(index, 1);
    for (const [productId, ids] of productAddonIds) {
      productAddonIds.set(
        productId,
        ids.filter((addonId) => addonId !== id),
      );
    }
    return true;
  },

  listCrusts() {
    return crusts.filter((item) => item.active);
  },

  listAllCrusts() {
    return [...crusts].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"),
    );
  },

  listCrustsPage(
    page: number,
    limit: number,
    all: boolean,
    filter: { q?: string; active?: boolean } = {},
  ) {
    const items = (all ? [...crusts] : this.listCrusts())
      .filter((item) => {
        if (filter.active !== undefined && item.active !== filter.active) return false;
        if (filter.q && !item.name.toLowerCase().includes(filter.q.toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"),
      );
    return paginateItems(items, page, limit);
  },

  createCrust(input: {
    name: string;
    addsPrice: boolean;
    price: number;
    pizzaKind: "salgada" | "doce";
  }) {
    const sortOrder =
      crusts.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
    const crust: Crust = {
      id: `crust-${Date.now()}`,
      name: input.name,
      addsPrice: input.addsPrice,
      price: input.addsPrice ? input.price : 0,
      sortOrder,
      active: true,
      pizzaKind: input.pizzaKind,
    };
    crusts.push(crust);
    return crust;
  },

  updateCrust(
    id: string,
    input: {
      name: string;
      addsPrice: boolean;
      price: number;
      pizzaKind: "salgada" | "doce";
    },
  ) {
    const crust = crusts.find((item) => item.id === id);
    if (!crust) return null;
    crust.name = input.name;
    crust.addsPrice = input.addsPrice;
    crust.price = input.addsPrice ? input.price : 0;
    crust.pizzaKind = input.pizzaKind;
    return crust;
  },

  deleteCrust(id: string) {
    const index = crusts.findIndex((item) => item.id === id);
    if (index < 0) return false;
    crusts.splice(index, 1);
    return true;
  },

  listSizes() {
    return sizes.filter((item) => item.active);
  },

  listAllSizes() {
    return [...sizes].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
  },

  listSizesPage(
    page: number,
    limit: number,
    all: boolean,
    filter: { q?: string; active?: boolean } = {},
  ) {
    const items = (all ? [...sizes] : this.listSizes())
      .filter((item) => {
        if (filter.active !== undefined && item.active !== filter.active) {
          return false;
        }
        if (
          filter.q &&
          !item.name.toLowerCase().includes(filter.q.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name, "pt-BR"),
      );
    return paginateItems(items, page, limit);
  },

  createSize(input: {
    name: string;
    price: number;
    maxSelect: number;
    priceMode: "addon" | "replace";
  }) {
    const sortOrder =
      sizes.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
    const size: Size = {
      id: `size-${Date.now()}`,
      name: input.name,
      price: input.price,
      maxSelect: Math.max(1, Math.min(10, input.maxSelect)),
      priceMode: input.priceMode,
      sortOrder,
      active: true,
    };
    sizes.push(size);
    return size;
  },

  updateSize(
    id: string,
    input: {
      name: string;
      price: number;
      maxSelect: number;
      priceMode: "addon" | "replace";
    },
  ) {
    const size = sizes.find((item) => item.id === id);
    if (!size) return null;
    size.name = input.name;
    size.price = input.price;
    size.maxSelect = Math.max(1, Math.min(10, input.maxSelect));
    size.priceMode = input.priceMode;
    return size;
  },

  deleteSize(id: string) {
    const index = sizes.findIndex((item) => item.id === id);
    if (index < 0) return false;
    sizes.splice(index, 1);
    return true;
  },

  replaceProductAddons(productId: string, addonIds: string[]) {
    productAddonIds.set(productId, [...new Set(addonIds.filter(Boolean))]);
    const product = products.find((item) => item.id === productId);
    if (product) {
      product.addons = this.linkedAddons(productId);
    }
    return product ?? null;
  },

  linkedAddons(productId: string) {
    const ids = productAddonIds.get(productId) ?? [];
    return ids
      .map((id) => addons.find((item) => item.id === id))
      .filter((item): item is Addon => Boolean(item));
  },

  getProduct(id: string) {
    const product = products.find((item) => item.id === id) ?? null;
    if (product) product.addons = this.linkedAddons(id);
    return product;
  },

  createProduct(input: {
    categoryId: string;
    name: string;
    description: string | null;
    price: number;
    active: boolean;
    customizable?: boolean;
    pizzaKind?: PizzaKind | null;
    notesEnabled?: boolean;
    addonsEnabled?: boolean;
    crustsEnabled?: boolean;
    addonIds?: string[];
    optionGroups?: ProductOptionGroup[];
  }) {
    const category = categories.find((item) => item.id === input.categoryId);
    const customizable = Boolean(input.customizable);
    const product: Product = {
      id: `prod-${Date.now()}`,
      categoryId: input.categoryId,
      categoryName: category?.name ?? "Cardápio",
      name: input.name,
      description: input.description,
      price: input.price,
      active: input.active,
      customizable,
      pizzaKind: customizable ? (input.pizzaKind ?? null) : null,
      notesEnabled: Boolean(input.notesEnabled),
      addonsEnabled: Boolean(input.addonsEnabled),
      crustsEnabled: Boolean(input.crustsEnabled),
      addons: [],
      optionGroups: input.optionGroups ?? [],
    };
    products.push(product);
    if (input.addonIds) this.replaceProductAddons(product.id, input.addonIds);
    return this.getProduct(product.id) ?? product;
  },

  updateProduct(
    id: string,
    input: Partial<{
      categoryId: string;
      name: string;
      description: string | null;
      price: number;
      active: boolean;
      customizable: boolean;
      pizzaKind: PizzaKind | null;
      notesEnabled: boolean;
      addonsEnabled: boolean;
      crustsEnabled: boolean;
      addonIds: string[];
      optionGroups: ProductOptionGroup[];
    }>,
  ) {
    const product = products.find((item) => item.id === id);
    if (!product) return null;
    if (input.categoryId) {
      product.categoryId = input.categoryId;
      product.categoryName =
        categories.find((item) => item.id === input.categoryId)?.name ??
        product.categoryName;
    }
    if (input.name !== undefined) product.name = input.name;
    if (input.description !== undefined) product.description = input.description;
    if (input.price !== undefined) product.price = input.price;
    if (input.active !== undefined) product.active = input.active;
    if (input.customizable !== undefined) product.customizable = input.customizable;
    if (input.pizzaKind !== undefined) product.pizzaKind = input.pizzaKind;
    if (input.customizable === false) product.pizzaKind = null;
    if (input.notesEnabled !== undefined) product.notesEnabled = input.notesEnabled;
    if (input.addonsEnabled !== undefined) product.addonsEnabled = input.addonsEnabled;
    if (input.crustsEnabled !== undefined) product.crustsEnabled = input.crustsEnabled;
    if (input.optionGroups !== undefined) product.optionGroups = input.optionGroups;
    if (input.addonIds !== undefined || input.addonsEnabled === false) {
      this.replaceProductAddons(
        id,
        input.addonsEnabled === false ? [] : (input.addonIds ?? []),
      );
    }
    return this.getProduct(id);
  },

  upsertCustomer(waPhone: string, name?: string | null, avatarUrl?: string | null) {
    const key = phoneKey(waPhone);
    const existing = customers.get(key);
    if (existing) {
      if (name && !existing.name) existing.name = name;
      if (avatarUrl) existing.avatarUrl = avatarUrl;
      return existing;
    }
    const customer: Customer = {
      id: `cust-${key}`,
      storeId: store.id,
      waPhone: key,
      name: name ?? null,
      avatarUrl: avatarUrl ?? null,
    };
    customers.set(key, customer);
    return customer;
  },

  findCustomerPhone(customerId: string) {
    for (const customer of customers.values()) {
      if (customer.id === customerId) return customer.waPhone;
    }
    return null;
  },

  getConversation(customerId: string) {
    return conversations.get(customerId) ?? null;
  },

  getConversationById(id: string) {
    for (const conversation of conversations.values()) {
      if (conversation.id === id) return conversation;
    }
    return null;
  },

  touchConversation(customerId: string) {
    const current = conversations.get(customerId);
    if (!current) return null;
    const next = {
      ...current,
      lastMessageAt: new Date().toISOString(),
    };
    conversations.set(customerId, next);
    return next;
  },

  closeConversationWithOrder(
    customerId: string,
    order: { id: string; code: string },
  ) {
    const current = conversations.get(customerId);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: Conversation = {
      ...current,
      state: "welcome",
      context: { cart: [] },
      handoffMode: "bot",
      handoffAt: null,
      handoffBy: null,
      closedAt: now,
      lastOrderId: order.id,
      lastOrderCode: order.code,
      lastMessageAt: now,
    };
    conversations.set(customerId, next);
    return next;
  },

  listLiveConversations(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return [...conversations.values()]
      .filter((item) => !item.closedAt)
      .filter(
        (item) =>
          item.handoffMode === "human" ||
          (item.lastMessageAt && new Date(item.lastMessageAt).getTime() >= since),
      )
      .sort(
        (left, right) =>
          new Date(right.lastMessageAt ?? 0).getTime() -
          new Date(left.lastMessageAt ?? 0).getTime(),
      )
      .map((item) => {
        const customer = [...customers.values()].find((row) => row.id === item.customerId);
        return {
          id: item.id,
          customerId: item.customerId,
          customerName: customer?.name ?? null,
          customerPhone: customer?.waPhone ?? "",
          customerAvatarUrl: customer?.avatarUrl ?? null,
          state: item.state,
          handoffMode: item.handoffMode === "human" ? ("human" as const) : ("bot" as const),
          handoffAt: item.handoffAt ?? null,
          handoffBy: item.handoffBy ?? null,
          lastMessageAt: item.lastMessageAt ?? new Date().toISOString(),
          cartItemCount: item.context.cart?.length ?? 0,
          lastOrderCode: item.lastOrderCode ?? null,
        };
      });
  },

  listConversationHistory(limit = 100) {
    return [...orders.values()]
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(0, limit)
      .map((order) => {
        const customer = [...customers.values()].find((row) => row.id === order.customerId);
        return {
          id: order.id,
          customerId: order.customerId,
          customerName: order.customerName ?? customer?.name ?? null,
          customerPhone: order.customerPhone ?? customer?.waPhone ?? "",
          customerAvatarUrl: customer?.avatarUrl ?? null,
          orderId: order.id,
          orderCode: order.code,
          orderStatus: order.status,
          totalCents: order.totalCents,
          closedAt: order.createdAt,
        };
      });
  },

  setConversationHandoff(id: string, mode: "bot" | "human", by?: string | null) {
    const current = this.getConversationById(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const next: Conversation = {
      ...current,
      handoffMode: mode,
      handoffAt: mode === "human" ? now : null,
      handoffBy: mode === "human" ? by?.trim() || null : null,
      lastMessageAt: now,
      closedAt: null,
    };
    conversations.set(current.customerId, next);
    return next;
  },

  saveConversation(
    customer: Customer,
    state: ConversationState,
    context: ConversationContext,
    options?: SaveConversationOptions,
  ) {
    const current = conversations.get(customer.id);
    const now = new Date().toISOString();
    const closedAt = options?.close
      ? now
      : options?.reopen || isOrderFlowState(state)
        ? null
        : (current?.closedAt ?? null);
    const conversation: Conversation = {
      id: current?.id ?? `conv-${customer.id}`,
      storeId: customer.storeId,
      customerId: customer.id,
      state,
      context,
      lastMessageAt: now,
      handoffMode: current?.handoffMode ?? "bot",
      handoffAt: current?.handoffAt ?? null,
      handoffBy: current?.handoffBy ?? null,
      closedAt,
      lastOrderId: current?.lastOrderId ?? null,
      lastOrderCode: current?.lastOrderCode ?? null,
    };
    conversations.set(customer.id, conversation);
    return conversation;
  },

  createOrder(input: {
    customer: Customer;
    fulfillment: Fulfillment;
    paymentMethod: PaymentMethod;
    changeForCents?: number | null;
    addressText?: string;
    notes?: string | null;
    items: {
      name: string;
      quantity: number;
      unitPriceCents: number;
      extras?: CartSelection[];
      notes?: string | null;
    }[];
    deliveryFeeCents: number;
    neighborhoodId?: string | null;
    neighborhoodName?: string | null;
  }) {
    const subtotalCents = input.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );
    const order: Order = {
      id: `order-${Date.now()}`,
      storeId: input.customer.storeId,
      customerId: input.customer.id,
      customerPhone: input.customer.waPhone,
      customerName: input.customer.name,
      code: createOrderCode(),
      status: "received",
      fulfillment: input.fulfillment,
      paymentMethod: input.paymentMethod,
      changeForCents:
        input.paymentMethod === "cash" ? (input.changeForCents ?? 0) : null,
      addressText: input.addressText ?? null,
      neighborhoodName: input.neighborhoodName?.trim() || null,
      notes: input.notes?.trim() || null,
      subtotalCents,
      deliveryFeeCents: input.deliveryFeeCents,
      totalCents: subtotalCents + input.deliveryFeeCents,
      prepMinutes: null,
      createdAt: new Date().toISOString(),
      items: input.items,
    };
    orders.set(order.id, order);
    this.createNotification({
      type: "order_created",
      orderId: order.id,
      orderCode: order.code,
      title: `Pedido #${order.code} criado`,
      changeSummary: null,
      actorName: input.customer.name?.trim() || "Cliente WhatsApp",
    });
    return order;
  },

  listOrders() {
    return [...orders.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  },

  listOrdersPage(page: number, limit: number, filter: OrderFilter = {}) {
    const query = filter.q?.toLowerCase();
    const fromMs = filter.createdFrom
      ? Date.parse(filter.createdFrom)
      : Number.NaN;
    const toMs = filter.createdTo ? Date.parse(filter.createdTo) : Number.NaN;
    const items = this.listOrders().filter((order) => {
      if (filter.status && order.status !== filter.status) return false;
      if (filter.fulfillment && order.fulfillment !== filter.fulfillment) {
        return false;
      }
      if (Number.isFinite(fromMs) || Number.isFinite(toMs)) {
        const created = Date.parse(order.createdAt);
        if (!Number.isFinite(created)) return false;
        if (Number.isFinite(fromMs) && created < fromMs) return false;
        if (Number.isFinite(toMs) && created > toMs) return false;
      }
      if (!query) return true;
      const haystack = [
        order.code,
        order.customerName ?? "",
        order.customerPhone ?? "",
        ...(order.items ?? []).map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return paginateItems(items, page, limit);
  },

  getOrderStats() {
    const all = this.listOrders();
    return {
      total: all.length,
      open: all.filter(
        (order) => !["delivered", "cancelled"].includes(order.status),
      ).length,
      totalCents: all.reduce((sum, order) => sum + order.totalCents, 0),
    };
  },

  getOrder(id: string) {
    return orders.get(id) ?? null;
  },

  findOrderByCode(code: string, customerId?: string) {
    return (
      [...orders.values()].find(
        (order) =>
          order.code.toLowerCase() === code.toLowerCase() &&
          (!customerId || order.customerId === customerId),
      ) ?? null
    );
  },

  findLatestOrder(customerId: string) {
    return (
      [...orders.values()]
        .filter((order) => order.customerId === customerId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null
    );
  },

  updateOrderStatus(
    id: string,
    status: OrderStatus,
    actorName = "Equipe",
    prepMinutes?: number | null,
  ) {
    const order = orders.get(id);
    if (!order) return null;
    if (!isAllowedOrderStatus(order.fulfillment, status)) {
      throw new Error("Pedido de retirada não sai para entrega.");
    }
    if (status === "preparing") {
      const minutes = Math.round(Number(prepMinutes));
      if (!Number.isFinite(minutes) || minutes < 1) {
        throw new Error("Informe o tempo de preparo em minutos.");
      }
      order.prepMinutes = minutes;
    }
    if (status === "accepted") {
      let minutes = Math.round(Number(prepMinutes));
      if (!Number.isFinite(minutes) || minutes < 1) {
        minutes = Math.round(Number(store.defaultAcceptMinutes));
      }
      if (Number.isFinite(minutes) && minutes >= 1) {
        order.prepMinutes = minutes;
      }
    }
    const previous = order.status;
    order.status = status;
    this.createNotification({
      type: "order_updated",
      orderId: order.id,
      orderCode: order.code,
      title: `Pedido #${order.code} alterado`,
      changeSummary: `Status: ${STATUS_LABEL[previous]} → ${STATUS_LABEL[status]}`,
      actorName,
    });
    return order;
  },

  createNotification(input: {
    type: NotificationType;
    orderId: string;
    orderCode: string;
    title: string;
    changeSummary: string | null;
    actorName: string;
  }) {
    const notification: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: input.type,
      orderId: input.orderId,
      orderCode: input.orderCode,
      title: input.title,
      changeSummary: input.changeSummary,
      actorName: input.actorName,
      createdAt: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(notification);
    return notification;
  },

  listNotifications(readerKey: string) {
    return [...notifications]
      .sort((left, right) => {
        const leftTime = Date.parse(left.createdAt) || 0;
        const rightTime = Date.parse(right.createdAt) || 0;
        if (rightTime !== leftTime) return rightTime - leftTime;
        return right.id.localeCompare(left.id);
      })
      .slice(0, 50)
      .map((item) => ({
        ...item,
        read: notificationReads.has(readKey(item.id, readerKey)),
      }));
  },

  markNotificationRead(id: string, readerKey: string) {
    const exists = notifications.some((item) => item.id === id);
    if (!exists) return false;
    notificationReads.add(readKey(id, readerKey));
    return true;
  },

  markAllNotificationsRead(readerKey: string) {
    let count = 0;
    for (const item of notifications.slice(0, 50)) {
      const key = readKey(item.id, readerKey);
      if (notificationReads.has(key)) continue;
      notificationReads.add(key);
      count += 1;
    }
    return count;
  },
};
