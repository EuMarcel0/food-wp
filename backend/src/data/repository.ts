import { flags } from "../config/env.js";
import { createOrderCode } from "../lib/money.js";
import type {
  CategoryFilter,
  OrderFilter,
  ProductFilter,
} from "../lib/filters.js";
import type { PageResult } from "../lib/pagination.js";
import { getSupabase } from "../lib/supabase.js";
import type {
  AppNotification,
  CartItem,
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
  Store,
} from "../types.js";
import { STATUS_LABEL, isAllowedOrderStatus } from "../conversation/status.js";
import { memoryStore } from "./memory.js";

const PRODUCT_SELECT =
  "*, categories(name), product_option_groups(*, product_options(*))";

function mapOptionGroups(row: Record<string, unknown>): ProductOptionGroup[] {
  const groups = row.product_option_groups;
  if (!Array.isArray(groups)) return [];
  return [...groups]
    .sort(
      (a, b) =>
        Number((a as { sort_order?: number }).sort_order ?? 0) -
        Number((b as { sort_order?: number }).sort_order ?? 0),
    )
    .map((raw) => {
      const group = raw as Record<string, unknown>;
      const options = Array.isArray(group.product_options)
        ? [...group.product_options]
        : [];
      return {
        id: String(group.id),
        name: String(group.name),
        required: group.required !== false,
        minSelect: Number(group.min_select ?? 1),
        maxSelect: Number(group.max_select ?? 1),
        priceMode: group.price_mode === "replace" ? "replace" : "addon",
        exclusiveSet: (group.exclusive_set as string | null) ?? null,
        price: Number(group.price ?? 0),
        sortOrder: Number(group.sort_order ?? 0),
        options: options
          .sort(
            (a, b) =>
              Number((a as { sort_order?: number }).sort_order ?? 0) -
              Number((b as { sort_order?: number }).sort_order ?? 0),
          )
          .map((item) => {
            const option = item as Record<string, unknown>;
            return {
              id: String(option.id),
              name: String(option.name),
              extraPrice: Number(option.extra_price ?? 0),
              sortOrder: Number(option.sort_order ?? 0),
              active: option.active !== false,
            };
          }),
      };
    });
}

function mapStore(row: Record<string, unknown>): Store {
  return {
    id: String(row.id),
    name: String(row.name),
    segment: String(row.segment ?? "generic"),
    phone: (row.phone as string | null) ?? null,
    deliveryEnabled: Boolean(row.delivery_enabled ?? true),
    pickupEnabled: Boolean(row.pickup_enabled ?? true),
    deliveryFeeCents: Number(row.delivery_fee_cents ?? 0),
    idleTimeoutMinutes: Math.max(1, Number(row.idle_timeout_minutes ?? 60)),
    neighborhoods: [],
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  const category = row.categories as { name?: string } | null;
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    categoryName: category?.name ?? "Cardápio",
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    price:
      row.price != null
        ? Number(row.price)
        : Number(row.price_cents ?? 0) / 100,
    active: Boolean(row.active ?? true),
    customizable: Boolean(row.customizable ?? false),
    notesEnabled: Boolean(row.notes_enabled ?? false),
    optionGroups: mapOptionGroups(row),
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  const customer = row.customers as
    | { wa_phone?: string; name?: string | null }
    | undefined;
  const items = Array.isArray(row.order_items)
    ? row.order_items.map((item) => {
        const typed = item as Record<string, unknown>;
        return {
          id: String(typed.id),
          name: String(typed.name),
          quantity: Number(typed.quantity),
          unitPriceCents: Number(typed.unit_price_cents),
          notes: (typed.notes as string | null) ?? null,
        };
      })
    : [];

  return {
    id: String(row.id),
    storeId: String(row.store_id),
    customerId: String(row.customer_id),
    customerPhone: customer?.wa_phone,
    customerName: customer?.name ?? null,
    code: String(row.code),
    status: row.status as OrderStatus,
    fulfillment: row.fulfillment as Fulfillment,
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    addressText: (row.address_text as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    subtotalCents: Number(row.subtotal_cents ?? 0),
    deliveryFeeCents: Number(row.delivery_fee_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    prepMinutes:
      row.prep_minutes == null ? null : Math.max(1, Number(row.prep_minutes)),
    createdAt: String(row.created_at),
    items,
  };
}

function mapNeighborhood(row: Record<string, unknown>): DeliveryNeighborhood {
  return {
    id: String(row.id),
    name: String(row.name),
    feeCents: Math.max(0, Number(row.fee_cents ?? 0)),
  };
}

function missingNeighborhoodsTable(message?: string) {
  return Boolean(message?.includes("delivery_neighborhoods"));
}

async function listNeighborhoods(storeId: string): Promise<DeliveryNeighborhood[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listNeighborhoods();

  const { data, error } = await supabase
    .from("delivery_neighborhoods")
    .select("id, name, fee_cents")
    .eq("store_id", storeId)
    .order("name");
  if (error) {
    if (missingNeighborhoodsTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapNeighborhood(row as Record<string, unknown>));
}

async function hydrateStore(row: Record<string, unknown>): Promise<Store> {
  const store = mapStore(row);
  store.neighborhoods = await listNeighborhoods(store.id);
  return store;
}

export async function getStore(): Promise<Store> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getStore();

  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error || !data) return memoryStore.getStore();
  return hydrateStore(data as Record<string, unknown>);
}

export async function updateStore(patch: {
  idleTimeoutMinutes?: number;
  deliveryFeeCents?: number;
}): Promise<Store> {
  const payload: Record<string, number> = {};
  if (patch.idleTimeoutMinutes !== undefined) {
    payload.idle_timeout_minutes = Math.min(
      10080,
      Math.max(1, Math.round(Number(patch.idleTimeoutMinutes))),
    );
  }
  if (patch.deliveryFeeCents !== undefined) {
    payload.delivery_fee_cents = Math.max(
      0,
      Math.round(Number(patch.deliveryFeeCents)),
    );
  }
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateStore(patch);

  const current = await getStore();
  const { data, error } = await supabase
    .from("stores")
    .update(payload)
    .eq("id", current.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      error?.message?.includes("idle_timeout_minutes")
        ? "Rode a migration 014_store_idle_timeout.sql no Supabase."
        : error?.message ?? "Falha ao salvar as configurações.",
    );
  }
  return hydrateStore(data as Record<string, unknown>);
}

export async function createNeighborhood(input: {
  name: string;
  feeCents: number;
}): Promise<DeliveryNeighborhood> {
  const name = input.name.trim();
  const feeCents = Math.max(0, Math.round(Number(input.feeCents)));
  if (!name) throw new Error("Informe o bairro.");

  const supabase = getSupabase();
  if (!supabase) return memoryStore.createNeighborhood({ name, feeCents });

  const store = await getStore();
  const { data, error } = await supabase
    .from("delivery_neighborhoods")
    .insert({
      store_id: store.id,
      name,
      fee_cents: feeCents,
    })
    .select("id, name, fee_cents")
    .single();
  if (error || !data) {
    if (missingNeighborhoodsTable(error?.message)) {
      throw new Error("Rode a migration 018_delivery_neighborhoods.sql no Supabase.");
    }
    if (error?.code === "23505") {
      throw new Error("Esse bairro já está cadastrado.");
    }
    throw new Error(error?.message ?? "Não foi possível incluir o bairro.");
  }
  return mapNeighborhood(data as Record<string, unknown>);
}

export async function deleteNeighborhood(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    memoryStore.deleteNeighborhood(id);
    return;
  }
  const { error } = await supabase
    .from("delivery_neighborhoods")
    .delete()
    .eq("id", id);
  if (error) {
    if (missingNeighborhoodsTable(error.message)) {
      throw new Error("Rode a migration 018_delivery_neighborhoods.sql no Supabase.");
    }
    throw new Error(error.message);
  }
}

export async function listProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listProducts();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("active", true)
    .order("name");
  if (error || !data) return memoryStore.listProducts();
  return data.map((row) => mapProduct(row as Record<string, unknown>));
}

export async function listAllProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllProducts();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .order("name");
  if (error || !data) return memoryStore.listAllProducts();
  return data.map((row) => mapProduct(row as Record<string, unknown>));
}

export async function listProductsPage(
  page: number,
  limit: number,
  filter: ProductFilter = {},
): Promise<PageResult<Product>> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listProductsPage(page, limit, filter);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .order("name");
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.active !== undefined) query = query.eq("active", filter.active);
  if (filter.q) {
    query = query.or(
      `name.ilike.%${filter.q}%,description.ilike.%${filter.q}%`,
    );
  }

  const { data, error, count } = await query.range(from, to);
  if (error) return memoryStore.listProductsPage(page, limit, filter);
  return {
    items: (data ?? []).map((row) => mapProduct(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active ?? true),
  };
}

export async function listCategories(): Promise<Category[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listCategories();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error || !data) return memoryStore.listCategories();
  return data.map((row) => mapCategory(row as Record<string, unknown>));
}

export async function listAllCategories(): Promise<Category[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllCategories();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order");
  if (error || !data) return memoryStore.listAllCategories();
  return data.map((row) => mapCategory(row as Record<string, unknown>));
}

export async function listCategoriesPage(
  page: number,
  limit: number,
  all = true,
  filter: CategoryFilter = {},
): Promise<PageResult<Category>> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listCategoriesPage(page, limit, all, filter);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("categories")
    .select("*", { count: "exact" })
    .order("sort_order")
    .order("name");
  if (!all) query = query.eq("active", true);
  if (filter.active !== undefined) query = query.eq("active", filter.active);
  if (filter.q) query = query.ilike("name", `%${filter.q}%`);

  const { data, error, count } = await query.range(from, to);
  if (error) return memoryStore.listCategoriesPage(page, limit, all, filter);
  return {
    items: (data ?? []).map((row) => mapCategory(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function createCategory(input: {
  name: string;
  sortOrder: number;
  active: boolean;
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createCategory(input);

  const store = await getStore();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      store_id: store.id,
      name: input.name,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Não foi possível salvar a categoria.");
  }
  return mapCategory(data as Record<string, unknown>);
}

export async function updateCategory(
  id: string,
  input: { name: string; sortOrder: number; active: boolean },
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateCategory(id, input);

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: input.name,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return mapCategory(data as Record<string, unknown>);
}

export async function deleteCategory(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.deleteCategory(id);

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if ((count ?? 0) > 0) {
    throw new Error(
      "Há itens do cardápio nesta categoria. Mova ou exclua-os primeiro.",
    );
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function createProduct(input: {
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  customizable?: boolean;
  notesEnabled?: boolean;
  optionGroups?: ProductOptionGroup[];
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createProduct(input);

  const store = await getStore();
  const { data, error } = await supabase
    .from("products")
    .insert({
      store_id: store.id,
      category_id: input.categoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      active: input.active,
      customizable: Boolean(input.customizable),
      notes_enabled: Boolean(input.notesEnabled),
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Não foi possível salvar o item.");
  }
  const product = mapProduct(data as Record<string, unknown>);
  if (input.optionGroups) {
    return (await replaceProductOptions(product.id, input.optionGroups)) ?? product;
  }
  return product;
}

export async function updateProduct(
  id: string,
  input: Partial<{
    categoryId: string;
    name: string;
    description: string | null;
    price: number;
    active: boolean;
    customizable: boolean;
    notesEnabled: boolean;
    optionGroups: ProductOptionGroup[];
  }>,
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateProduct(id, input);

  const payload: Record<string, unknown> = {};
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.price !== undefined) payload.price = input.price;
  if (input.active !== undefined) payload.active = input.active;
  if (input.customizable !== undefined) payload.customizable = input.customizable;
  if (input.notesEnabled !== undefined) payload.notes_enabled = input.notesEnabled;

  if (Object.keys(payload).length) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return null;
  }
  if (input.optionGroups) {
    return replaceProductOptions(id, input.optionGroups);
  }
  return getProduct(id);
}

async function replaceProductOptions(
  productId: string,
  groups: ProductOptionGroup[],
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getProduct(productId);

  await supabase.from("product_option_groups").delete().eq("product_id", productId);
  for (const [index, group] of groups.entries()) {
    const { data, error } = await supabase
      .from("product_option_groups")
      .insert({
        product_id: productId,
        name: group.name.trim(),
        required: group.required,
        min_select: group.minSelect,
        max_select: group.maxSelect,
        price_mode: group.priceMode,
        exclusive_set: group.exclusiveSet?.trim() || null,
        price: group.price ?? 0,
        sort_order: group.sortOrder ?? index,
      })
      .select("id")
      .single();
    if (error || !data) {
      const missingPrice = error?.message?.includes('column "price"');
      throw new Error(
        missingPrice
          ? "Rode a migration 017_option_group_price.sql no Supabase."
          : error?.message ?? "Não foi possível salvar as opções.",
      );
    }
    const options = group.options.filter((option) => option.name.trim());
    if (!options.length) continue;
    const { error: optionError } = await supabase.from("product_options").insert(
      options.map((option, optionIndex) => ({
        group_id: data.id,
        name: option.name.trim(),
        extra_price: option.extraPrice,
        sort_order: option.sortOrder ?? optionIndex,
        active: option.active !== false,
      })),
    );
    if (optionError) {
      throw new Error(optionError.message);
    }
  }
  return getProduct(productId);
}

export async function getProduct(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getProduct(id);

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapProduct(data as Record<string, unknown>);
}

export async function upsertCustomer(waPhone: string, name?: string | null) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.upsertCustomer(waPhone, name);

  const store = await getStore();
  const phone = waPhone.replace(/\D/g, "");
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("store_id", store.id)
    .eq("wa_phone", phone)
    .maybeSingle();

  if (existing) {
    if (name && !existing.name) {
      await supabase.from("customers").update({ name }).eq("id", existing.id);
    }
    return {
      id: existing.id,
      storeId: existing.store_id,
      waPhone: existing.wa_phone,
      name: name ?? existing.name,
    } satisfies Customer;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ store_id: store.id, wa_phone: phone, name: name ?? null })
    .select("*")
    .single();
  if (error || !data) return memoryStore.upsertCustomer(waPhone, name);
  return {
    id: data.id,
    storeId: data.store_id,
    waPhone: data.wa_phone,
    name: data.name,
  } satisfies Customer;
}

export async function getConversation(customerId: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getConversation(customerId);

  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    storeId: data.store_id,
    customerId: data.customer_id,
    state: data.state as ConversationState,
    context: (data.context ?? { cart: [] }) as ConversationContext,
    lastMessageAt: data.last_message_at ? String(data.last_message_at) : undefined,
  } satisfies Conversation;
}

export async function saveConversation(
  customer: Customer,
  state: ConversationState,
  context: ConversationContext,
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.saveConversation(customer, state, context);

  const current = await getConversation(customer.id);
  if (current) {
    await supabase
      .from("conversations")
      .update({
        state,
        context,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    return { ...current, state, context, lastMessageAt: new Date().toISOString() };
  }

  const { data } = await supabase
    .from("conversations")
    .insert({
      store_id: customer.storeId,
      customer_id: customer.id,
      state,
      context,
    })
    .select("*")
    .single();

  return {
    id: data?.id ?? `conv-${customer.id}`,
    storeId: customer.storeId,
    customerId: customer.id,
    state,
    context,
    lastMessageAt: data?.last_message_at
      ? String(data.last_message_at)
      : new Date().toISOString(),
  } satisfies Conversation;
}

export async function createOrder(input: {
  customer: Customer;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  addressText?: string;
  notes?: string | null;
  items: {
    productId?: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    extras?: CartItem["extras"];
    notes?: string | null;
  }[];
  deliveryFeeCents: number;
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createOrder(input);

  const subtotalCents = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const payload = {
    store_id: input.customer.storeId,
    customer_id: input.customer.id,
    code: createOrderCode(),
    status: "received",
    fulfillment: input.fulfillment,
    payment_method: input.paymentMethod,
    address_text: input.addressText ?? null,
    notes: input.notes?.trim() || null,
    subtotal_cents: subtotalCents,
    delivery_fee_cents: input.deliveryFeeCents,
    total_cents: subtotalCents + input.deliveryFeeCents,
  };

  const { data, error } = await supabase
    .from("orders")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) return memoryStore.createOrder(input);

  await supabase.from("order_items").insert(
    input.items.map((item) => ({
      order_id: data.id,
      product_id: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      extras: "extras" in item ? item.extras ?? [] : [],
      notes: item.notes?.trim() || null,
    })),
  );

  const order = mapOrder({
    ...data,
    customers: { wa_phone: input.customer.waPhone, name: input.customer.name },
    order_items: input.items,
  });
  await createNotification({
    storeId: order.storeId,
    type: "order_created",
    orderId: order.id,
    orderCode: order.code,
    title: `Pedido #${order.code} criado`,
    changeSummary: null,
    actorName: input.customer.name?.trim() || "Cliente WhatsApp",
  });
  return order;
}

export async function listOrders() {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listOrders();

  const { data, error } = await supabase
    .from("orders")
    .select("*, customers(wa_phone, name), order_items(*)")
    .order("created_at", { ascending: false });
  if (error || !data) return memoryStore.listOrders();
  return data.map((row) => mapOrder(row as Record<string, unknown>));
}

export async function listOrdersPage(
  page: number,
  limit: number,
  filter: OrderFilter = {},
): Promise<PageResult<Order>> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listOrdersPage(page, limit, filter);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("orders")
    .select("*, customers(wa_phone, name), order_items(*)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.fulfillment) query = query.eq("fulfillment", filter.fulfillment);
  if (filter.q) {
    query = query.or(
      `code.ilike.%${filter.q}%,address_text.ilike.%${filter.q}%`,
    );
  }

  const { data, error, count } = await query.range(from, to);
  if (error) return memoryStore.listOrdersPage(page, limit, filter);
  return {
    items: (data ?? []).map((row) => mapOrder(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getOrderStats() {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getOrderStats();

  const { data, error } = await supabase
    .from("orders")
    .select("status, total_cents");
  if (error || !data) return memoryStore.getOrderStats();

  const rows = data as { status: string; total_cents: number }[];
  return {
    total: rows.length,
    open: rows.filter(
      (row) => row.status !== "delivered" && row.status !== "cancelled",
    ).length,
    totalCents: rows.reduce((sum, row) => sum + Number(row.total_cents ?? 0), 0),
  };
}

export async function findOrderByCode(code: string, customerId?: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.findOrderByCode(code, customerId);

  let query = supabase
    .from("orders")
    .select("*, customers(wa_phone, name), order_items(*)")
    .ilike("code", code);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data } = await query.maybeSingle();
  return data ? mapOrder(data as Record<string, unknown>) : null;
}

export async function findLatestOrder(customerId: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.findLatestOrder(customerId);

  const { data } = await supabase
    .from("orders")
    .select("*, customers(wa_phone, name), order_items(*)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapOrder(data as Record<string, unknown>) : null;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  actorName = "Equipe",
  prepMinutes?: number | null,
) {
  const supabase = getSupabase();
  if (!supabase) {
    return memoryStore.updateOrderStatus(id, status, actorName, prepMinutes);
  }

  const { data: current } = await supabase
    .from("orders")
    .select("id, code, status, store_id, fulfillment")
    .eq("id", id)
    .maybeSingle();
  if (!current) return null;
  if (!isAllowedOrderStatus(current.fulfillment as Fulfillment, status)) {
    throw new Error("Pedido de retirada não sai para entrega.");
  }

  if (status === "preparing") {
    const minutes = Math.round(Number(prepMinutes));
    if (!Number.isFinite(minutes) || minutes < 1) {
      throw new Error("Informe o tempo de preparo em minutos.");
    }
    prepMinutes = minutes;
  }

  const previous = current.status as OrderStatus;
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "preparing" && prepMinutes != null) {
    payload.prep_minutes = prepMinutes;
  }

  const { data, error } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", id)
    .select("*, customers(wa_phone, name), order_items(*)")
    .single();
  if (error || !data) {
    if (error?.message?.includes("prep_minutes")) {
      throw new Error("Rode a migration 019_order_prep_minutes.sql no Supabase.");
    }
    return null;
  }
  const order = mapOrder(data as Record<string, unknown>);
  if (previous !== status) {
    await createNotification({
      storeId: String(current.store_id),
      type: "order_updated",
      orderId: order.id,
      orderCode: order.code,
      title: `Pedido #${order.code} alterado`,
      changeSummary: `Status: ${STATUS_LABEL[previous]} → ${STATUS_LABEL[status]}`,
      actorName,
    });
  }
  return order;
}

function mapNotification(
  row: Record<string, unknown>,
  read: boolean,
): AppNotification {
  return {
    id: String(row.id),
    type: row.type as NotificationType,
    orderId: String(row.order_id ?? ""),
    orderCode: String(row.order_code),
    title: String(row.title),
    changeSummary: (row.change_summary as string | null) ?? null,
    actorName: String(row.actor_name),
    createdAt: String(row.created_at),
    read,
  };
}

export async function createNotification(input: {
  storeId: string;
  type: NotificationType;
  orderId: string;
  orderCode: string;
  title: string;
  changeSummary: string | null;
  actorName: string;
}) {
  const supabase = getSupabase();
  if (!supabase) {
    return memoryStore.createNotification(input);
  }

  const { error } = await supabase.from("notifications").insert({
    store_id: input.storeId,
    type: input.type,
    order_id: input.orderId,
    order_code: input.orderCode,
    title: input.title,
    change_summary: input.changeSummary,
    actor_name: input.actorName,
  });
  if (error) {
    console.error("Falha ao gravar notificação", error.message);
  }
}

export async function listNotifications(readerKey: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listNotifications(readerKey);

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return memoryStore.listNotifications(readerKey);

  const ids = data.map((row) => String(row.id));
  const readIds = new Set<string>();
  if (ids.length) {
    const { data: reads } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("reader_key", readerKey)
      .in("notification_id", ids);
    for (const row of reads ?? []) {
      readIds.add(String(row.notification_id));
    }
  }

  return data.map((row) =>
    mapNotification(row as Record<string, unknown>, readIds.has(String(row.id))),
  );
}

export async function markNotificationRead(id: string, readerKey: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.markNotificationRead(id, readerKey);

  const { error } = await supabase.from("notification_reads").upsert({
    notification_id: id,
    reader_key: readerKey,
  });
  if (error) {
    console.error("Falha ao marcar notificação como lida", error.message);
    return false;
  }
  return true;
}

export function usingSupabase() {
  return flags.supabaseReady;
}
