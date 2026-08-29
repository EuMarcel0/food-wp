export type OrderStatus =
  | "received"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

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
  profilePhotoUrl: string | null;
  legalName: string | null;
  cnpj: string | null;
  receiptFooter: string | null;
  businessHours: BusinessHoursDay[] | null;
  neighborhoods: DeliveryNeighborhood[];
};

export type InstalledPrinter = {
  name: string;
  isDefault: boolean;
  offline: boolean;
};

export type PrinterList = {
  host: string;
  printers: InstalledPrinter[];
};

export type Health = {
  ok: boolean;
  supabase: boolean;
  whatsapp: boolean;
};

export type OrderStats = {
  total: number;
  open: number;
  totalCents: number;
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
