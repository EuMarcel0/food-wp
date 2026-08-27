import { createOrderCode } from "../lib/money.js";
import type {
  CategoryFilter,
  OrderFilter,
  ProductFilter,
} from "../lib/filters.js";
import { paginateItems } from "../lib/pagination.js";
import { STATUS_LABEL, isAllowedOrderStatus } from "../conversation/status.js";
import { env } from "../config/env.js";
import type {
  Addon,
  AppNotification,
  Category,
  Conversation,
  ConversationContext,
  ConversationState,
  Customer,
  DeliveryNeighborhood,
  Fulfillment,
  NotificationType,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductOptionGroup,
  CartSelection,
  Store,
  StorePatch,
} from "../types.js";

const store: Store = {
  id: env.defaultStoreId,
  name: "Estabelecimento Demo",
  segment: "lanches",
  phone: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFeeCents: 700,
  idleTimeoutMinutes: 60,
  profilePhotoUrl: null,
  legalName: null,
  cnpj: null,
  receiptFooter: null,
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
    notesEnabled: false,
    addonsEnabled: false,
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
    notesEnabled: false,
    addonsEnabled: false,
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
    notesEnabled: false,
    addonsEnabled: false,
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
    notesEnabled: false,
    addonsEnabled: false,
    addons: [],
    optionGroups: [],
  },
];

const addons: Addon[] = [];
const productAddonIds = new Map<string, string[]>();

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
    notesEnabled?: boolean;
    addonsEnabled?: boolean;
    addonIds?: string[];
    optionGroups?: ProductOptionGroup[];
  }) {
    const category = categories.find((item) => item.id === input.categoryId);
    const product: Product = {
      id: `prod-${Date.now()}`,
      categoryId: input.categoryId,
      categoryName: category?.name ?? "Cardápio",
      name: input.name,
      description: input.description,
      price: input.price,
      active: input.active,
      customizable: Boolean(input.customizable),
      notesEnabled: Boolean(input.notesEnabled),
      addonsEnabled: Boolean(input.addonsEnabled),
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
      notesEnabled: boolean;
      addonsEnabled: boolean;
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
    if (input.notesEnabled !== undefined) product.notesEnabled = input.notesEnabled;
    if (input.addonsEnabled !== undefined) product.addonsEnabled = input.addonsEnabled;
    if (input.optionGroups !== undefined) product.optionGroups = input.optionGroups;
    if (input.addonIds !== undefined || input.addonsEnabled === false) {
      this.replaceProductAddons(
        id,
        input.addonsEnabled === false ? [] : (input.addonIds ?? []),
      );
    }
    return this.getProduct(id);
  },

  upsertCustomer(waPhone: string, name?: string | null) {
    const key = phoneKey(waPhone);
    const existing = customers.get(key);
    if (existing) {
      if (name && !existing.name) existing.name = name;
      return existing;
    }
    const customer: Customer = {
      id: `cust-${key}`,
      storeId: store.id,
      waPhone: key,
      name: name ?? null,
    };
    customers.set(key, customer);
    return customer;
  },

  getConversation(customerId: string) {
    return conversations.get(customerId) ?? null;
  },

  saveConversation(
    customer: Customer,
    state: ConversationState,
    context: ConversationContext,
  ) {
    const current = conversations.get(customer.id);
    const conversation: Conversation = {
      id: current?.id ?? `conv-${customer.id}`,
      storeId: customer.storeId,
      customerId: customer.id,
      state,
      context,
      lastMessageAt: new Date().toISOString(),
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
    const items = this.listOrders().filter((order) => {
      if (filter.status && order.status !== filter.status) return false;
      if (filter.fulfillment && order.fulfillment !== filter.fulfillment) {
        return false;
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
    return notifications.slice(0, 50).map((item) => ({
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
};
