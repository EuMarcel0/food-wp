import { flags } from "../config/env.js";
import { DEFAULT_TIMEZONE, parseBusinessHours } from "../lib/businessHours.js";
import { createOrderCode } from "../lib/money.js";
import type {
  CategoryFilter,
  OrderFilter,
  ProductFilter,
} from "../lib/filters.js";
import { buildOrderStats } from "../lib/orderStats.js";
import type { PageResult } from "../lib/pagination.js";
import { getSupabase } from "../lib/supabase.js";
import {
  isOrderFlowState,
  type Addon,
  type AppNotification,
  type CartItem,
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
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
  type PizzaKind,
  type Product,
  type ProductOptionGroup,
  type SaveConversationOptions,
  type Size,
  type Store,
  type StorePatch,
} from "../types.js";
import { STATUS_LABEL, isAllowedOrderStatus } from "../conversation/status.js";
import { memoryStore } from "./memory.js";

const PRODUCT_SELECT_CORE =
  "*, categories(name), product_option_groups(*, product_options(*))";
const PRODUCT_SELECT = `${PRODUCT_SELECT_CORE}, product_addons(addon_id, addons(id, name, price, sort_order, active))`;

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
    timezone: String(row.timezone ?? DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE,
    deliveryEnabled: Boolean(row.delivery_enabled ?? true),
    pickupEnabled: Boolean(row.pickup_enabled ?? true),
    deliveryFeeCents: Number(row.delivery_fee_cents ?? 0),
    idleTimeoutMinutes: Math.max(1, Number(row.idle_timeout_minutes ?? 60)),
    defaultAcceptMinutes: Math.min(
      480,
      Math.max(
        1,
        Number(row.default_accept_minutes ?? row.default_prep_minutes ?? 40),
      ),
    ),
    autoAcceptOrders: Boolean(row.auto_accept_orders ?? false),
    profilePhotoUrl: (row.profile_photo_url as string | null) ?? null,
    legalName: (row.legal_name as string | null) ?? null,
    cnpj: (row.cnpj as string | null) ?? null,
    receiptFooter: (row.receipt_footer as string | null) ?? null,
    businessHours: (() => {
      try {
        return parseBusinessHours(row.business_hours);
      } catch {
        return null;
      }
    })(),
    neighborhoods: [],
  };
}

function mapAddon(row: Record<string, unknown>): Addon {
  return {
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active ?? true),
  };
}

function mapProductAddons(row: Record<string, unknown>): Addon[] {
  const links = row.product_addons;
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      const typed = link as { addons?: Record<string, unknown> | Record<string, unknown>[] };
      const raw = Array.isArray(typed.addons) ? typed.addons[0] : typed.addons;
      return raw ? mapAddon(raw) : null;
    })
    .filter((item): item is Addon => Boolean(item))
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"),
    );
}

function missingAddonsTable(message?: string) {
  return Boolean(
    message?.includes("addons") ||
      message?.includes("product_addons") ||
      message?.includes("addons_enabled"),
  );
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
    pizzaKind: parsePizzaKind(row.pizza_kind),
    notesEnabled: Boolean(row.notes_enabled ?? false),
    addonsEnabled: Boolean(row.addons_enabled ?? false),
    crustsEnabled: Boolean(row.crusts_enabled ?? false),
    addons: mapProductAddons(row),
    optionGroups: mapOptionGroups(row),
  };
}

function parsePizzaKind(raw: unknown): PizzaKind | null {
  return raw === "salgada" || raw === "doce" ? raw : null;
}

function missingPizzaKindColumn(message?: string) {
  return Boolean(message?.includes("pizza_kind"));
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
          extras: Array.isArray(typed.extras)
            ? (typed.extras as OrderItem["extras"])
            : [],
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
    changeForCents:
      row.change_for_cents == null ? null : Math.max(0, Number(row.change_for_cents)),
    addressText: (row.address_text as string | null) ?? null,
    neighborhoodName: (row.neighborhood_name as string | null) ?? null,
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

export async function updateStore(patch: StorePatch): Promise<Store> {
  const payload: Record<string, unknown> = {};
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
  if (patch.name !== undefined) {
    payload.name = patch.name;
  }
  if (patch.profilePhotoUrl !== undefined) {
    payload.profile_photo_url = patch.profilePhotoUrl;
  }
  if (patch.legalName !== undefined) {
    payload.legal_name = patch.legalName;
  }
  if (patch.cnpj !== undefined) {
    payload.cnpj = patch.cnpj;
  }
  if (patch.receiptFooter !== undefined) {
    payload.receipt_footer = patch.receiptFooter;
  }
  if (patch.businessHours !== undefined) {
    payload.business_hours = patch.businessHours;
  }
  if (patch.defaultAcceptMinutes !== undefined) {
    payload.default_accept_minutes = Math.min(
      480,
      Math.max(1, Math.round(Number(patch.defaultAcceptMinutes))),
    );
  }
  if (patch.autoAcceptOrders !== undefined) {
    payload.auto_accept_orders = Boolean(patch.autoAcceptOrders);
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
        : error?.message?.includes("profile_photo_url")
          ? "Rode a migration 022_store_branding.sql no Supabase."
        : error?.message?.includes("legal_name") ||
            error?.message?.includes("receipt_footer") ||
            /\bcnpj\b/i.test(error?.message ?? "")
          ? "Rode a migration 023_store_receipt.sql no Supabase."
        : error?.message?.includes("business_hours")
          ? "Rode a migration 027_store_hours.sql no Supabase."
        : error?.message?.includes("default_accept_minutes") ||
            error?.message?.includes("default_prep_minutes") ||
            error?.message?.includes("auto_accept_orders")
          ? "Rode as migrations 029 e 033 no banco (aceite automático)."
        : error?.message ?? "Falha ao salvar as configurações.",
    );
  }
  return hydrateStore(data as Record<string, unknown>);
}

export async function saveStoreProfilePhoto(storeId: string, bytes: Buffer) {
  const supabase = getSupabase();
  if (!supabase) {
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }
  const path = `${storeId}/profile.jpg`;
  const { error } = await supabase.storage.from("store-branding").upload(path, bytes, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) {
    throw new Error(
      error.message.includes("store-branding") || error.message.includes("Bucket")
        ? "Rode a migration 022_store_branding.sql no Supabase."
        : error.message,
    );
  }
  const { data } = supabase.storage.from("store-branding").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
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

  const first = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("active", true)
    .order("name");
  const { data, error } =
    first.error && missingAddonsTable(first.error.message)
      ? await supabase
          .from("products")
          .select(PRODUCT_SELECT_CORE)
          .eq("active", true)
          .order("name")
      : first;
  if (error || !data) return memoryStore.listProducts();
  return data.map((row) => mapProduct(row as Record<string, unknown>));
}

export async function listAllProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllProducts();

  const first = await supabase.from("products").select(PRODUCT_SELECT).order("name");
  const { data, error } =
    first.error && missingAddonsTable(first.error.message)
      ? await supabase.from("products").select(PRODUCT_SELECT_CORE).order("name")
      : first;
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

  let { data, error, count } = await query.range(from, to);
  if (error && missingAddonsTable(error.message)) {
    let fallback = supabase
      .from("products")
      .select(PRODUCT_SELECT_CORE, { count: "exact" })
      .order("name");
    if (filter.categoryId) fallback = fallback.eq("category_id", filter.categoryId);
    if (filter.active !== undefined) fallback = fallback.eq("active", filter.active);
    if (filter.q) {
      fallback = fallback.or(
        `name.ilike.%${filter.q}%,description.ilike.%${filter.q}%`,
      );
    }
    ({ data, error, count } = await fallback.range(from, to));
  }
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

export async function listAddons(): Promise<Addon[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAddons();
  const { data, error } = await supabase
    .from("addons")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingAddonsTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapAddon(row as Record<string, unknown>));
}

export async function listAllAddons(): Promise<Addon[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllAddons();
  const { data, error } = await supabase
    .from("addons")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingAddonsTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapAddon(row as Record<string, unknown>));
}

export async function listAddonsPage(
  page: number,
  limit: number,
  all: boolean,
  filter: { q?: string; active?: boolean } = {},
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAddonsPage(page, limit, all, filter);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("addons")
    .select("*", { count: "exact" })
    .order("sort_order")
    .order("name");
  if (!all) query = query.eq("active", true);
  if (filter.active !== undefined) query = query.eq("active", filter.active);
  if (filter.q) query = query.ilike("name", `%${filter.q}%`);

  const { data, error, count } = await query.range(from, to);
  if (error) {
    if (missingAddonsTable(error.message)) {
      return { items: [] as Addon[], total: 0, page, limit };
    }
    return memoryStore.listAddonsPage(page, limit, all, filter);
  }
  return {
    items: (data ?? []).map((row) => mapAddon(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function createAddon(input: {
  name: string;
  price: number;
  sortOrder: number;
  active: boolean;
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createAddon(input);
  const store = await getStore();
  const { data, error } = await supabase
    .from("addons")
    .insert({
      store_id: store.id,
      name: input.name,
      price: input.price,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      missingAddonsTable(error?.message)
        ? "Rode a migration 021_addons.sql no Supabase."
        : error?.message ?? "Não foi possível salvar o adicional.",
    );
  }
  return mapAddon(data as Record<string, unknown>);
}

export async function updateAddon(
  id: string,
  input: { name: string; price: number; sortOrder: number; active: boolean },
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateAddon(id, input);
  const { data, error } = await supabase
    .from("addons")
    .update({
      name: input.name,
      price: input.price,
      sort_order: input.sortOrder,
      active: input.active,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return mapAddon(data as Record<string, unknown>);
}

export async function deleteAddon(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.deleteAddon(id);
  const { error } = await supabase.from("addons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

async function replaceProductAddons(productId: string, addonIds: string[]) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.replaceProductAddons(productId, addonIds);
  await supabase.from("product_addons").delete().eq("product_id", productId);
  const unique = [...new Set(addonIds.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await supabase.from("product_addons").insert(
    unique.map((addonId) => ({ product_id: productId, addon_id: addonId })),
  );
  if (error) {
    throw new Error(
      missingAddonsTable(error.message)
        ? "Rode a migration 021_addons.sql no Supabase."
        : error.message,
    );
  }
}

function missingCrustsTable(message?: string) {
  return Boolean(
    message?.includes("crusts") || message?.includes("crusts_enabled"),
  );
}

function mapCrust(row: Record<string, unknown>): Crust {
  const kind = String(row.pizza_kind ?? "salgada");
  return {
    id: String(row.id),
    name: String(row.name),
    addsPrice: Boolean(row.adds_price ?? false),
    price: Number(row.price ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active ?? true),
    pizzaKind: kind === "doce" ? "doce" : "salgada",
  };
}

const DEFAULT_CRUSTS = [
  { name: "Sem Borda", sortOrder: 0, pizzaKind: "salgada" as const },
  { name: "Borda de cheddar", sortOrder: 1, pizzaKind: "salgada" as const },
  { name: "Borda de Catupiry", sortOrder: 2, pizzaKind: "salgada" as const },
  { name: "Sem Borda", sortOrder: 0, pizzaKind: "doce" as const },
  { name: "Borda de chocolate", sortOrder: 1, pizzaKind: "doce" as const },
] as const;

async function ensureDefaultCrusts() {
  const supabase = getSupabase();
  if (!supabase) return;
  const store = await getStore();
  const { count, error } = await supabase
    .from("crusts")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id);
  if (error) {
    if (missingCrustsTable(error.message)) return;
    throw new Error(error.message);
  }
  if (count) return;
  const { error: insertError } = await supabase.from("crusts").insert(
    DEFAULT_CRUSTS.map((item) => ({
      store_id: store.id,
      name: item.name,
      adds_price: false,
      price: 0,
      sort_order: item.sortOrder,
      active: true,
      pizza_kind: item.pizzaKind,
    })),
  );
  if (insertError && !missingCrustsTable(insertError.message)) {
    throw new Error(insertError.message);
  }
}

export async function listCrusts(): Promise<Crust[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listCrusts();
  await ensureDefaultCrusts();
  const { data, error } = await supabase
    .from("crusts")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingCrustsTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapCrust(row as Record<string, unknown>));
}

export async function listAllCrusts(): Promise<Crust[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllCrusts();
  await ensureDefaultCrusts();
  const { data, error } = await supabase
    .from("crusts")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingCrustsTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapCrust(row as Record<string, unknown>));
}

export async function listCrustsPage(
  page: number,
  limit: number,
  all: boolean,
  filter: { q?: string; active?: boolean } = {},
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listCrustsPage(page, limit, all, filter);
  await ensureDefaultCrusts();

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("crusts")
    .select("*", { count: "exact" })
    .order("sort_order")
    .order("name");
  if (!all) query = query.eq("active", true);
  if (filter.active !== undefined) query = query.eq("active", filter.active);
  if (filter.q) query = query.ilike("name", `%${filter.q}%`);

  const { data, error, count } = await query.range(from, to);
  if (error) {
    if (missingCrustsTable(error.message)) {
      return { items: [] as Crust[], total: 0, page, limit };
    }
    return memoryStore.listCrustsPage(page, limit, all, filter);
  }
  return {
    items: (data ?? []).map((row) => mapCrust(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function createCrust(input: {
  name: string;
  addsPrice: boolean;
  price: number;
  pizzaKind: "salgada" | "doce";
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createCrust(input);
  const store = await getStore();
  const { data: last } = await supabase
    .from("crusts")
    .select("sort_order")
    .eq("store_id", store.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = Number(last?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("crusts")
    .insert({
      store_id: store.id,
      name: input.name,
      adds_price: input.addsPrice,
      price: input.addsPrice ? input.price : 0,
      sort_order: sortOrder,
      active: true,
      pizza_kind: input.pizzaKind,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      error?.message?.includes("pizza_kind")
        ? "Rode a migration 034_crust_pizza_kind.sql no banco."
        : missingCrustsTable(error?.message)
          ? "Rode a migration 025_crusts.sql no banco."
          : error?.message ?? "Não foi possível salvar a borda.",
    );
  }
  return mapCrust(data as Record<string, unknown>);
}

export async function updateCrust(
  id: string,
  input: {
    name: string;
    addsPrice: boolean;
    price: number;
    pizzaKind: "salgada" | "doce";
  },
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateCrust(id, input);
  const { data, error } = await supabase
    .from("crusts")
    .update({
      name: input.name,
      adds_price: input.addsPrice,
      price: input.addsPrice ? input.price : 0,
      pizza_kind: input.pizzaKind,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    if (error?.message?.includes("pizza_kind")) {
      throw new Error("Rode a migration 034_crust_pizza_kind.sql no banco.");
    }
    return null;
  }
  return mapCrust(data as Record<string, unknown>);
}

export async function deleteCrust(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.deleteCrust(id);
  const { error } = await supabase.from("crusts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

function missingSizesTable(message?: string) {
  return Boolean(
    message?.includes("sizes") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("Could not find the table")),
  );
}

function mapSize(row: Record<string, unknown>): Size {
  return {
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price ?? 0),
    maxSelect: Math.max(1, Number(row.max_select ?? 1)),
    priceMode: row.price_mode === "addon" ? "addon" : "replace",
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active ?? true),
  };
}

const DEFAULT_SIZES = [
  { name: "P - Pequena", price: 35, maxSelect: 1, sortOrder: 0 },
  { name: "M - Média", price: 45, maxSelect: 1, sortOrder: 1 },
  { name: "G - Grande", price: 55, maxSelect: 2, sortOrder: 2 },
  { name: "F - Família", price: 75, maxSelect: 2, sortOrder: 3 },
] as const;

async function ensureDefaultSizes() {
  const supabase = getSupabase();
  if (!supabase) return;
  const store = await getStore();
  const { count, error } = await supabase
    .from("sizes")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id);
  if (error) {
    if (missingSizesTable(error.message)) return;
    throw new Error(error.message);
  }
  if (count) return;
  const { error: insertError } = await supabase.from("sizes").insert(
    DEFAULT_SIZES.map((item) => ({
      store_id: store.id,
      name: item.name,
      price: item.price,
      max_select: item.maxSelect,
      price_mode: "replace",
      sort_order: item.sortOrder,
      active: true,
    })),
  );
  if (insertError && !missingSizesTable(insertError.message)) {
    throw new Error(insertError.message);
  }
}

export async function listSizes(): Promise<Size[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listSizes();
  await ensureDefaultSizes();
  const { data, error } = await supabase
    .from("sizes")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingSizesTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapSize(row as Record<string, unknown>));
}

export async function listAllSizes(): Promise<Size[]> {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listAllSizes();
  await ensureDefaultSizes();
  const { data, error } = await supabase
    .from("sizes")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) {
    if (missingSizesTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapSize(row as Record<string, unknown>));
}

export async function listSizesPage(
  page: number,
  limit: number,
  all: boolean,
  filter: { q?: string; active?: boolean } = {},
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listSizesPage(page, limit, all, filter);
  await ensureDefaultSizes();

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from("sizes")
    .select("*", { count: "exact" })
    .order("sort_order")
    .order("name");
  if (!all) query = query.eq("active", true);
  if (filter.active !== undefined) query = query.eq("active", filter.active);
  if (filter.q) query = query.ilike("name", `%${filter.q}%`);

  const { data, error, count } = await query.range(from, to);
  if (error) {
    if (missingSizesTable(error.message)) {
      return { items: [] as Size[], total: 0, page, limit };
    }
    return memoryStore.listSizesPage(page, limit, all, filter);
  }
  return {
    items: (data ?? []).map((row) => mapSize(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function createSize(input: {
  name: string;
  price: number;
  maxSelect: number;
  priceMode: "addon" | "replace";
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createSize(input);
  const store = await getStore();
  const { data: last } = await supabase
    .from("sizes")
    .select("sort_order")
    .eq("store_id", store.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = Number(last?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("sizes")
    .insert({
      store_id: store.id,
      name: input.name,
      price: input.price,
      max_select: Math.max(1, Math.min(10, input.maxSelect)),
      price_mode: input.priceMode,
      sort_order: sortOrder,
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      missingSizesTable(error?.message)
        ? "Rode a migration 026_sizes.sql no Supabase."
        : error?.message ?? "Não foi possível salvar o tamanho.",
    );
  }
  return mapSize(data as Record<string, unknown>);
}

export async function updateSize(
  id: string,
  input: {
    name: string;
    price: number;
    maxSelect: number;
    priceMode: "addon" | "replace";
  },
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.updateSize(id, input);
  const { data, error } = await supabase
    .from("sizes")
    .update({
      name: input.name,
      price: input.price,
      max_select: Math.max(1, Math.min(10, input.maxSelect)),
      price_mode: input.priceMode,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return null;
  return mapSize(data as Record<string, unknown>);
}

export async function deleteSize(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.deleteSize(id);
  const { error } = await supabase.from("sizes").delete().eq("id", id);
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
  pizzaKind?: PizzaKind | null;
  notesEnabled?: boolean;
  addonsEnabled?: boolean;
  crustsEnabled?: boolean;
  addonIds?: string[];
  optionGroups?: ProductOptionGroup[];
}) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.createProduct(input);

  const store = await getStore();
  const customizable = Boolean(input.customizable);
  const { data, error } = await supabase
    .from("products")
    .insert({
      store_id: store.id,
      category_id: input.categoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      active: input.active,
      customizable,
      pizza_kind: customizable ? (input.pizzaKind ?? null) : null,
      notes_enabled: Boolean(input.notesEnabled),
      addons_enabled: Boolean(input.addonsEnabled),
      crusts_enabled: Boolean(input.crustsEnabled),
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error || !data) {
    throw new Error(
      missingPizzaKindColumn(error?.message)
        ? "Rode a migration 028_pizza_kind.sql no Supabase."
        : missingCrustsTable(error?.message)
        ? "Rode a migration 025_crusts.sql no Supabase."
        : missingAddonsTable(error?.message)
          ? "Rode a migration 021_addons.sql no Supabase."
          : error?.message ?? "Não foi possível salvar o item.",
    );
  }
  const product = mapProduct(data as Record<string, unknown>);
  if (input.addonIds) await replaceProductAddons(product.id, input.addonIds);
  if (input.optionGroups) {
    return (await replaceProductOptions(product.id, input.optionGroups)) ?? product;
  }
  return (await getProduct(product.id)) ?? product;
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
    pizzaKind: PizzaKind | null;
    notesEnabled: boolean;
    addonsEnabled: boolean;
    crustsEnabled: boolean;
    addonIds: string[];
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
  if (input.pizzaKind !== undefined) payload.pizza_kind = input.pizzaKind;
  if (input.customizable === false) payload.pizza_kind = null;
  if (input.notesEnabled !== undefined) payload.notes_enabled = input.notesEnabled;
  if (input.addonsEnabled !== undefined) payload.addons_enabled = input.addonsEnabled;
  if (input.crustsEnabled !== undefined) payload.crusts_enabled = input.crustsEnabled;

  if (Object.keys(payload).length) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) {
      if (missingPizzaKindColumn(error.message)) {
        throw new Error("Rode a migration 028_pizza_kind.sql no Supabase.");
      }
      if (missingCrustsTable(error.message)) {
        throw new Error("Rode a migration 025_crusts.sql no Supabase.");
      }
      if (missingAddonsTable(error.message)) {
        throw new Error("Rode a migration 021_addons.sql no Supabase.");
      }
      return null;
    }
  }
  if (input.optionGroups) {
    await replaceProductOptions(id, input.optionGroups);
  }
  if (input.addonIds !== undefined || input.addonsEnabled === false) {
    await replaceProductAddons(
      id,
      input.addonsEnabled === false ? [] : (input.addonIds ?? []),
    );
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

  const first = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();
  const { data, error } =
    first.error && missingAddonsTable(first.error.message)
      ? await supabase
          .from("products")
          .select(PRODUCT_SELECT_CORE)
          .eq("id", id)
          .maybeSingle()
      : first;
  if (error || !data) return null;
  return mapProduct(data as Record<string, unknown>);
}

function mapCustomer(data: Record<string, unknown>): Customer {
  return {
    id: String(data.id),
    storeId: String(data.store_id),
    waPhone: String(data.wa_phone),
    name: data.name != null ? String(data.name) : null,
    avatarUrl: data.avatar_url != null ? String(data.avatar_url) : null,
  };
}

export async function upsertCustomer(
  waPhone: string,
  name?: string | null,
  avatarUrl?: string | null,
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.upsertCustomer(waPhone, name, avatarUrl);

  const store = await getStore();
  const phone = waPhone.replace(/\D/g, "");
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("store_id", store.id)
    .eq("wa_phone", phone)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (name && !existing.name) patch.name = name;
    if (avatarUrl && avatarUrl !== existing.avatar_url) patch.avatar_url = avatarUrl;
    if (Object.keys(patch).length) {
      const { data: updated, error: updateError } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updateError?.message?.includes("avatar_url") && patch.avatar_url) {
        delete patch.avatar_url;
        if (Object.keys(patch).length) {
          await supabase.from("customers").update(patch).eq("id", existing.id);
        }
      } else if (updated) {
        return mapCustomer(updated as Record<string, unknown>);
      }
    }
    return mapCustomer({
      ...existing,
      name: name ?? existing.name,
      avatar_url: avatarUrl ?? existing.avatar_url,
    } as Record<string, unknown>);
  }

  const payload: Record<string, unknown> = {
    store_id: store.id,
    wa_phone: phone,
    name: name ?? null,
    avatar_url: avatarUrl ?? null,
  };
  let { data, error } = await supabase.from("customers").insert(payload).select("*").single();
  if (error?.message?.includes("avatar_url")) {
    delete payload.avatar_url;
    const retry = await supabase.from("customers").insert(payload).select("*").single();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) return memoryStore.upsertCustomer(waPhone, name, avatarUrl);
  return mapCustomer(data as Record<string, unknown>);
}

function mapConversation(data: Record<string, unknown>): Conversation {
  return {
    id: String(data.id),
    storeId: String(data.store_id),
    customerId: String(data.customer_id),
    state: data.state as ConversationState,
    context: (data.context ?? { cart: [] }) as ConversationContext,
    lastMessageAt: data.last_message_at ? String(data.last_message_at) : undefined,
    activatedAt: data.activated_at ? String(data.activated_at) : null,
    handoffMode: data.handoff_mode === "human" ? "human" : "bot",
    handoffAt: data.handoff_at ? String(data.handoff_at) : null,
    handoffBy: data.handoff_by != null ? String(data.handoff_by) : null,
    closedAt: data.closed_at ? String(data.closed_at) : null,
    lastOrderId: data.last_order_id != null ? String(data.last_order_id) : null,
    lastOrderCode: data.last_order_code != null ? String(data.last_order_code) : null,
  };
}

/** Reinicia o cronômetro ao reabrir; mantém se já estava ativa. */
function nextActivatedAt(
  current: Conversation | null | undefined,
  closedAt: string | null,
  now: string,
): string | null {
  if (closedAt != null) return current?.activatedAt ?? null;
  if (current?.closedAt || !current?.activatedAt) return now;
  return current.activatedAt;
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
  return mapConversation(data as Record<string, unknown>);
}

export async function getConversationById(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getConversationById(id);

  const { data } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return mapConversation(data as Record<string, unknown>);
}

export async function touchConversation(customerId: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.touchConversation(customerId);

  const now = new Date().toISOString();
  // Só atualiza atividade — não reabre conversa encerrada (closed_at).
  await supabase
    .from("conversations")
    .update({ last_message_at: now })
    .eq("customer_id", customerId);
}

export async function closeConversationWithOrder(
  customerId: string,
  order: { id: string; code: string },
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.closeConversationWithOrder(customerId, order);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("conversations")
    .update({
      state: "welcome",
      context: { cart: [] },
      handoff_mode: "bot",
      handoff_at: null,
      handoff_by: null,
      closed_at: now,
      last_order_id: order.id,
      last_order_code: order.code,
      last_message_at: now,
    })
    .eq("customer_id", customerId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (
      error.message?.includes("closed_at") ||
      error.message?.includes("last_order_id")
    ) {
      throw new Error("Rode a migration 031_conversation_closed.sql no Supabase.");
    }
    throw new Error(error.message);
  }
  return data ? mapConversation(data as Record<string, unknown>) : null;
}

export async function listLiveConversations(hours = 24) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listLiveConversations(hours);

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, customers(id, name, wa_phone, avatar_url)")
    .is("closed_at", null)
    .or(`last_message_at.gte.${since},handoff_mode.eq.human`)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) {
    if (error.message?.includes("handoff_mode")) {
      throw new Error("Rode a migration 030_conversation_handoff.sql no Supabase.");
    }
    if (error.message?.includes("closed_at")) {
      throw new Error("Rode a migration 031_conversation_closed.sql no Supabase.");
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const context = (row.context ?? { cart: [] }) as ConversationContext;
    const lastMessageAt = String(row.last_message_at ?? new Date().toISOString());
    return {
      id: String(row.id),
      customerId: String(row.customer_id),
      customerName: customer?.name ?? null,
      customerPhone: String(customer?.wa_phone ?? ""),
      customerAvatarUrl: customer?.avatar_url != null ? String(customer.avatar_url) : null,
      state: row.state as ConversationState,
      handoffMode: row.handoff_mode === "human" ? ("human" as const) : ("bot" as const),
      handoffAt: row.handoff_at ? String(row.handoff_at) : null,
      handoffBy: row.handoff_by != null ? String(row.handoff_by) : null,
      lastMessageAt,
      activatedAt: String(row.activated_at ?? lastMessageAt),
      cartItemCount: Array.isArray(context.cart) ? context.cart.length : 0,
      lastOrderCode: row.last_order_code != null ? String(row.last_order_code) : null,
    };
  });
}

/** Histórico = pedidos confirmados (conversa que virou pedido). */
export async function listConversationHistory(limit = 100) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.listConversationHistory(limit);

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, code, status, total_cents, created_at, customer_id, customers(id, name, wa_phone, avatar_url)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return {
      id: String(row.id),
      customerId: String(row.customer_id ?? customer?.id ?? ""),
      customerName: customer?.name ?? null,
      customerPhone: String(customer?.wa_phone ?? ""),
      customerAvatarUrl: customer?.avatar_url != null ? String(customer.avatar_url) : null,
      orderId: String(row.id),
      orderCode: String(row.code ?? ""),
      orderStatus: row.status as OrderStatus,
      totalCents: Number(row.total_cents ?? 0),
      closedAt: String(row.created_at ?? new Date().toISOString()),
    };
  });
}

export async function setConversationHandoff(
  id: string,
  mode: "bot" | "human",
  by?: string | null,
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.setConversationHandoff(id, mode, by);

  const now = new Date().toISOString();
  const payload =
    mode === "human"
      ? {
          handoff_mode: "human",
          handoff_at: now,
          handoff_by: by?.trim() || null,
          last_message_at: now,
        }
      : {
          handoff_mode: "bot",
          handoff_at: null,
          handoff_by: null,
          last_message_at: now,
        };

  const { data, error } = await supabase
    .from("conversations")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.message?.includes("handoff_mode")) {
      throw new Error("Rode a migration 030_conversation_handoff.sql no Supabase.");
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapConversation(data as Record<string, unknown>);
}

export async function saveConversation(
  customer: Customer,
  state: ConversationState,
  context: ConversationContext,
  options?: SaveConversationOptions,
) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.saveConversation(customer, state, context, options);

  const current = await getConversation(customer.id);
  const now = new Date().toISOString();
  // Reabre Ativas no Bem-vindo ou no fluxo de pedido; status/"vlw" mantém closed_at.
  const closedAt = options?.close
    ? now
    : options?.reopen || isOrderFlowState(state)
      ? null
      : (current?.closedAt ?? null);
  const activatedAt = nextActivatedAt(current, closedAt, now);

  if (current) {
    const { error } = await supabase
      .from("conversations")
      .update({
        state,
        context,
        last_message_at: now,
        closed_at: closedAt,
        activated_at: activatedAt,
      })
      .eq("id", current.id);
    if (error) {
      if (error.message?.includes("activated_at")) {
        throw new Error("Rode a migration 035_conversation_activated_at.sql no Supabase.");
      }
      throw new Error(error.message);
    }
    return {
      ...current,
      state,
      context,
      lastMessageAt: now,
      activatedAt,
      closedAt,
    };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      store_id: customer.storeId,
      customer_id: customer.id,
      state,
      context,
      handoff_mode: "bot",
      closed_at: closedAt,
      activated_at: activatedAt,
    })
    .select("*")
    .single();
  if (error) {
    if (error.message?.includes("activated_at")) {
      throw new Error("Rode a migration 035_conversation_activated_at.sql no Supabase.");
    }
    throw new Error(error.message);
  }

  return mapConversation(
    (data ?? {
      id: `conv-${customer.id}`,
      store_id: customer.storeId,
      customer_id: customer.id,
      state,
      context,
      last_message_at: now,
      activated_at: activatedAt,
      handoff_mode: "bot",
      closed_at: closedAt,
    }) as Record<string, unknown>,
  );
}

export async function createOrder(input: {
  customer: Customer;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  changeForCents?: number | null;
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
  neighborhoodId?: string | null;
  neighborhoodName?: string | null;
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
    change_for_cents:
      input.paymentMethod === "cash" ? (input.changeForCents ?? 0) : null,
    address_text: input.addressText ?? null,
    neighborhood_id: input.neighborhoodId ?? null,
    neighborhood_name: input.neighborhoodName?.trim() || null,
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
  let row = data;
  if (
    (error || !row) &&
    (error?.message?.includes("neighborhood_name") ||
      error?.message?.includes("neighborhood_id"))
  ) {
    const { neighborhood_id: _id, neighborhood_name: _name, ...legacy } = payload;
    const retry = await supabase.from("orders").insert(legacy).select("*").single();
    row = retry.data;
    if (retry.error || !row) return memoryStore.createOrder(input);
  } else if (error || !row) {
    return memoryStore.createOrder(input);
  }

  await supabase.from("order_items").insert(
    input.items.map((item) => ({
      order_id: row.id,
      product_id: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      extras: "extras" in item ? item.extras ?? [] : [],
      notes: item.notes?.trim() || null,
    })),
  );

  const order = mapOrder({
    ...row,
    neighborhood_name:
      (row as Record<string, unknown>).neighborhood_name ??
      input.neighborhoodName ??
      null,
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
  if (filter.createdFrom) {
    query = query.gte("created_at", filter.createdFrom);
  }
  if (filter.createdTo) {
    query = query.lte("created_at", filter.createdTo);
  }
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

export async function getOrder(id: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getOrder(id);

  const { data, error } = await supabase
    .from("orders")
    .select("*, customers(wa_phone, name), order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return memoryStore.getOrder(id);
  return mapOrder(data as Record<string, unknown>);
}

export async function getOrderStats(day?: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.getOrderStats(day);

  const store = await getStore();
  const { data, error } = await supabase
    .from("orders")
    .select("status, fulfillment, prep_minutes, created_at");
  if (error || !data) return memoryStore.getOrderStats(day);

  return buildOrderStats(
    (data as Record<string, unknown>[]).map((row) => ({
      status: String(row.status ?? "received"),
      fulfillment: String(row.fulfillment ?? "delivery"),
      prepMinutes:
        row.prep_minutes == null ? null : Number(row.prep_minutes),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    })),
    store.timezone || DEFAULT_TIMEZONE,
    day,
  );
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

  if (status === "accepted") {
    let minutes = Math.round(Number(prepMinutes));
    if (!Number.isFinite(minutes) || minutes < 1) {
      try {
        const store = await getStore();
        minutes = Math.round(Number(store.defaultAcceptMinutes));
      } catch {
        minutes = NaN;
      }
    }
    prepMinutes = Number.isFinite(minutes) && minutes >= 1 ? minutes : null;
  }

  const previous = current.status as OrderStatus;
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (
    (status === "preparing" || status === "accepted") &&
    prepMinutes != null
  ) {
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

  return data
    .map((row) =>
      mapNotification(
        row as Record<string, unknown>,
        readIds.has(String(row.id)),
      ),
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt) || 0;
      const rightTime = Date.parse(right.createdAt) || 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return right.id.localeCompare(left.id);
    });
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

export async function markAllNotificationsRead(readerKey: string) {
  const supabase = getSupabase();
  if (!supabase) return memoryStore.markAllNotificationsRead(readerKey);

  const items = await listNotifications(readerKey);
  const unread = items.filter((item) => !item.read);
  if (!unread.length) return 0;

  const { error } = await supabase.from("notification_reads").upsert(
    unread.map((item) => ({
      notification_id: item.id,
      reader_key: readerKey,
    })),
  );
  if (error) {
    console.error("Falha ao marcar notificações como lidas", error.message);
    return 0;
  }
  return unread.length;
}

export function usingSupabase() {
  return flags.supabaseReady;
}
