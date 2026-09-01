export type OrderStatus =
  | "received"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type HandoffMode = "bot" | "human";

export type LiveConversation = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  customerAvatarUrl?: string | null;
  state: string;
  handoffMode: HandoffMode;
  handoffAt: string | null;
  handoffBy: string | null;
  lastMessageAt: string;
  /** Início do atendimento ativo — base do cronômetro. */
  activatedAt: string;
  cartItemCount: number;
  lastOrderCode?: string | null;
};

export type ConversationHistoryItem = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  customerAvatarUrl?: string | null;
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  totalCents: number;
  closedAt: string;
};

export type OrderItem = {
  id?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  extras?: {
    groupId: string;
    options: { name: string }[];
  }[];
  notes?: string | null;
};

export type Order = {
  id: string;
  code: string;
  status: OrderStatus;
  fulfillment: "delivery" | "pickup";
  paymentMethod: "pix" | "cash" | "card" | "credit" | "debit" | null;
  changeForCents?: number | null;
  addressText: string | null;
  neighborhoodName?: string | null;
  notes?: string | null;
  customerPhone?: string;
  customerName?: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  prepMinutes?: number | null;
  createdAt: string;
  items?: OrderItem[];
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type Addon = {
  id: string;
  name: string;
  price: number;
  sortOrder: number;
  active: boolean;
};

export type Crust = {
  id: string;
  name: string;
  addsPrice: boolean;
  price: number;
  sortOrder: number;
  active: boolean;
  pizzaKind: PizzaKind;
};

export type Size = {
  id: string;
  name: string;
  price: number;
  maxSelect: number;
  priceMode: "addon" | "replace";
  sortOrder: number;
  active: boolean;
};

export type PizzaKind = "salgada" | "doce";

export type Product = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  customizable: boolean;
  pizzaKind: PizzaKind | null;
  notesEnabled: boolean;
  addonsEnabled: boolean;
  crustsEnabled: boolean;
  addons: Addon[];
  optionGroups: ProductOptionGroup[];
};

export type ProductOption = {
  id: string;
  name: string;
  extraPrice: number;
  sortOrder: number;
  active: boolean;
};

export type ProductOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  priceMode: "addon" | "replace";
  exclusiveSet?: string | null;
  price: number;
  sortOrder: number;
  options: ProductOption[];
};

export type DeliveryNeighborhood = {
  id: string;
  name: string;
  feeCents: number;
};

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BusinessHoursDay = {
  day: Weekday;
  closed: boolean;
  open: string;
  close: string;
};

export type Store = {
  id: string;
  name: string;
  segment: string;
  timezone: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
  idleTimeoutMinutes: number;
  defaultAcceptMinutes: number;
  autoAcceptOrders: boolean;
  allowCustomerCancel: boolean;
  profilePhotoUrl: string | null;
  legalName: string | null;
  cnpj: string | null;
  receiptFooter: string | null;
  businessHours: BusinessHoursDay[] | null;
  neighborhoods: DeliveryNeighborhood[];
};

export type Health = {
  ok: boolean;
  supabase: boolean;
  whatsapp: boolean;
};

export type OrderStats = {
  /** Dia filtrado (YYYY-MM-DD). */
  day?: string;
  open: number;
  total: number;
  byStatus: Record<OrderStatus, number>;
  today: {
    created: number;
    delivered: number;
    cancelled: number;
    open: number;
  };
  openByFulfillment: {
    delivery: number;
    pickup: number;
  };
  oldestOpenMinutes: number | null;
  avgPrepMinutesToday: number | null;
};

export type NotificationType = "order_created" | "order_updated";

export type AppNotification = {
  id: string;
  type: NotificationType;
  orderId: string;
  orderCode: string;
  title: string;
  changeSummary: string | null;
  actorName: string;
  createdAt: string;
  read: boolean;
};
