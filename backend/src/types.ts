export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "pix" | "cash" | "card" | "credit" | "debit";

export type OrderStatus =
  | "received"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type ConversationState =
  | "welcome"
  | "awaiting_product"
  | "awaiting_addon"
  | "awaiting_crust"
  | "awaiting_option"
  | "awaiting_quantity"
  | "awaiting_item_note"
  | "cart"
  | "awaiting_order_note"
  | "awaiting_fulfillment"
  | "awaiting_neighborhood"
  | "awaiting_address"
  | "awaiting_payment"
  | "awaiting_change"
  | "awaiting_order_code";

/** Estados em que a conversa volta a aparecer em Ativas (pedido em montagem). */
export const ORDER_FLOW_STATES = new Set<ConversationState>([
  "awaiting_product",
  "awaiting_addon",
  "awaiting_crust",
  "awaiting_option",
  "awaiting_quantity",
  "awaiting_item_note",
  "cart",
  "awaiting_order_note",
  "awaiting_fulfillment",
  "awaiting_neighborhood",
  "awaiting_address",
  "awaiting_payment",
  "awaiting_change",
]);

export function isOrderFlowState(state: ConversationState) {
  return ORDER_FLOW_STATES.has(state);
}

export type SaveConversationOptions = {
  /** Reabre Ativas (ex.: Bem-vindo ou nova mensagem após encerramento). */
  reopen?: boolean;
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

export type CartSelection = {
  groupId: string;
  groupName: string;
  priceMode: "addon" | "replace";
  /** Preço-base do tamanho (R$), gravado na escolha para não depender do reload do produto. */
  basePrice?: number;
  options: { id: string; name: string; extraPrice: number }[];
  skipped?: boolean;
};

export type CartItem = {
  productId: string;
  name: string;
  catalogName?: string;
  catalogDescription?: string | null;
  quantity: number;
  unitPriceCents: number;
  extras?: CartSelection[];
  notes?: string | null;
};

export type ConversationContext = {
  cart: CartItem[];
  selectedProductId?: string;
  optionGroupIndex?: number;
  draftSelections?: CartSelection[];
  draftItem?: CartItem;
  fulfillment?: Fulfillment;
  neighborhoodId?: string;
  neighborhoodName?: string;
  addressText?: string;
  paymentMethod?: PaymentMethod;
  changeForCents?: number;
  orderNotes?: string | null;
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
  phone: string | null;
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

export type StorePatch = {
  idleTimeoutMinutes?: number;
  deliveryFeeCents?: number;
  name?: string;
  profilePhotoUrl?: string | null;
  legalName?: string | null;
  cnpj?: string | null;
  receiptFooter?: string | null;
  businessHours?: BusinessHoursDay[] | null;
  defaultAcceptMinutes?: number;
  autoAcceptOrders?: boolean;
  allowCustomerCancel?: boolean;
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

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type Customer = {
  id: string;
  storeId: string;
  waPhone: string;
  name: string | null;
  avatarUrl?: string | null;
};

export type HandoffMode = "bot" | "human";

export type Conversation = {
  id: string;
  storeId: string;
  customerId: string;
  state: ConversationState;
  context: ConversationContext;
  lastMessageAt?: string;
  /** Momento em que a conversa entrou em Ativas (cronômetro do painel). */
  activatedAt?: string | null;
  handoffMode?: HandoffMode;
  handoffAt?: string | null;
  handoffBy?: string | null;
  closedAt?: string | null;
  lastOrderId?: string | null;
  lastOrderCode?: string | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: ConversationMessageDirection | null;
  /** Última mensagem do cliente — não muda quando o bot responde. */
  lastInboundAt?: string | null;
};

export type LiveConversation = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  customerAvatarUrl?: string | null;
  state: ConversationState;
  handoffMode: HandoffMode;
  handoffAt: string | null;
  handoffBy: string | null;
  lastMessageAt: string;
  /** Início do atendimento ativo — base do cronômetro. */
  activatedAt: string;
  cartItemCount: number;
  lastOrderCode?: string | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: ConversationMessageDirection | null;
  lastInboundAt?: string | null;
};

export type ConversationMessageAuthor = "customer" | "bot" | "agent";
export type ConversationMessageDirection = "inbound" | "outbound";

export type ConversationMessageActionItem = {
  id?: string;
  title: string;
  description?: string;
};

export type ConversationMessageActions = {
  type: "buttons" | "list";
  items: ConversationMessageActionItem[];
  /** Rótulo do botão que abre a lista no WhatsApp. */
  listButtonLabel?: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  customerId: string;
  direction: ConversationMessageDirection;
  author: ConversationMessageAuthor;
  body: string;
  msgType: string;
  actions?: ConversationMessageActions | null;
  waMessageId?: string | null;
  createdAt: string;
};

export type ConversationHistoryItem = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  customerAvatarUrl?: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: OrderStatus | null;
  totalCents: number | null;
  closedAt: string;
};

export type Order = {
  id: string;
  storeId: string;
  customerId: string;
  customerPhone?: string;
  customerName?: string | null;
  code: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod | null;
  changeForCents: number | null;
  addressText: string | null;
  neighborhoodName: string | null;
  notes: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  prepMinutes: number | null;
  createdAt: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  extras?: CartSelection[];
  notes?: string | null;
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
