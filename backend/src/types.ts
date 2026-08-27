export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "pix" | "cash" | "card";

export type OrderStatus =
  | "received"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type ConversationState =
  | "welcome"
  | "awaiting_product"
  | "awaiting_option"
  | "awaiting_quantity"
  | "awaiting_item_note"
  | "cart"
  | "awaiting_order_note"
  | "awaiting_fulfillment"
  | "awaiting_address"
  | "awaiting_payment"
  | "awaiting_order_code";

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
  sortOrder: number;
  options: ProductOption[];
};

export type CartSelection = {
  groupId: string;
  groupName: string;
  priceMode: "addon" | "replace";
  options: { id: string; name: string; extraPrice: number }[];
  skipped?: boolean;
};

export type CartItem = {
  productId: string;
  name: string;
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
  addressText?: string;
  orderNotes?: string | null;
};

export type Store = {
  id: string;
  name: string;
  segment: string;
  phone: string | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
  idleTimeoutMinutes: number;
};

export type Product = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  customizable: boolean;
  notesEnabled: boolean;
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
};

export type Conversation = {
  id: string;
  storeId: string;
  customerId: string;
  state: ConversationState;
  context: ConversationContext;
  lastMessageAt?: string;
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
  addressText: string | null;
  notes: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  createdAt: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
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
