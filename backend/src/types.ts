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
  | "awaiting_quantity"
  | "cart"
  | "awaiting_fulfillment"
  | "awaiting_address"
  | "awaiting_payment"
  | "awaiting_order_code";

export type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type ConversationContext = {
  cart: CartItem[];
  selectedProductId?: string;
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
