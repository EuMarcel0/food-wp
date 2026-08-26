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
  | "cart"
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
};

export type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  extras?: CartSelection[];
};

export type ConversationContext = {
  cart: CartItem[];
  selectedProductId?: string;
  optionGroupIndex?: number;
  draftSelections?: CartSelection[];
  fulfillment?: Fulfillment;
  addressText?: string;
};

export type Store = {
  id: string;
  name: string;
  segment: string;
  phone: string | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
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
