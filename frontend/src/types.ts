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
  lastMessagePreview?: string | null;
  lastMessageDirection?: "inbound" | "outbound" | null;
  lastInboundAt?: string | null;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  customerId: string;
  direction: "inbound" | "outbound";
  author: "customer" | "bot" | "agent";
  body: string;
  msgType: string;
  actions?: ConversationMessageActions | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  waMessageId?: string | null;
  createdAt: string;
};

export type ConversationMessagesPage = {
  items: ConversationMessage[];
  hasMore: boolean;
  nextBefore: { createdAt: string; id: string } | null;
};

export type ConversationMessageActionItem = {
  id?: string;
  title: string;
  description?: string;
};

export type ConversationMessageActions = {
  type: "buttons" | "list";
  items: ConversationMessageActionItem[];
  listButtonLabel?: string;
};

export type ConversationHistoryItem = {
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
  activatedAt: string;
  cartItemCount: number;
  lastOrderCode?: string | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: "inbound" | "outbound" | null;
  lastInboundAt?: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: OrderStatus | null;
  totalCents: number | null;
  closedAt: string;
};

export type ConversationHistoryPage = {
  items: ConversationHistoryItem[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

export type LiveConversationPage = {
  items: LiveConversation[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
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

export type OrderLogAction =
  | "order_created"
  | "items_updated"
  | "payment_updated"
  | "status_updated"
  | "fulfillment_updated";

export type OrderLog = {
  id: string;
  orderId: string;
  action: OrderLogAction;
  actorName: string;
  summary: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
};

export type Order = {
  id: string;
  code: string;
  status: OrderStatus;
  fulfillment: "delivery" | "pickup";
  paymentMethod: "pix" | "cash" | "card" | "credit" | "debit" | "other" | null;
  paymentMethodLabel?: string | null;
  changeForCents?: number | null;
  addressText: string | null;
  neighborhoodName?: string | null;
  neighborhoodId?: string | null;
  notes?: string | null;
  cancelReason?: string | null;
  customerPhone?: string;
  customerName?: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  prepMinutes?: number | null;
  createdAt: string;
  /** Preenchido quando o cupom automático foi impresso na cozinha. */
  autoPrintedAt?: string | null;
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

export type PaymentMethodKind = "pix" | "cash" | "credit" | "debit" | "other";

export type StorePaymentMethod = {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  sortOrder: number;
  active: boolean;
};

export type PizzaKind = "salgada" | "doce";

export type Product = {
  id: string;
  categoryId: string;
  categoryName: string;
  /** Ordem do item na categoria (lista do WhatsApp). */
  sortOrder: number;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  customizable: boolean;
  pizzaKind: PizzaKind | null;
  notesEnabled: boolean;
  addonsEnabled: boolean;
  crustsEnabled: boolean;
  quantityEnabled: boolean;
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
  batchCategoryIds: string[];
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

export type SalesByPaymentReportRow = {
  id: string;
  code: string;
  createdAt: string;
  status: OrderStatus;
  paymentMethod: Order["paymentMethod"];
  paymentMethodLabel: string | null;
  displayPaymentLabel: string;
  totalCents: number;
  customerName: string | null;
};

export type SalesByPaymentSummaryRow = {
  paymentMethod: string | null;
  paymentMethodLabel: string;
  orderCount: number;
  totalCents: number;
};

export type SalesByPaymentReport = {
  from: string | null;
  to: string | null;
  paymentMethods: string[];
  summary: SalesByPaymentSummaryRow[];
  orders: SalesByPaymentReportRow[];
  totals: { orderCount: number; totalCents: number };
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

export type NotificationsPage = {
  items: AppNotification[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
  unread: number;
};
