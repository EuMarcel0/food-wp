import dayjs from "dayjs";
import type { Order, OrderStatus } from "../types";

export function formatBRL(cents: number) {
  return formatReais(cents / 100);
}

const ADDON_GROUP_ID = "__addon__";

export function addonLabel(
  extras?: { groupId: string; options?: { name: string }[] }[] | null,
) {
  const names = (extras ?? [])
    .filter((item) => item.groupId === ADDON_GROUP_ID)
    .flatMap((item) => (item.options ?? []).map((option) => option.name).filter(Boolean));
  if (!names.length) return null;
  return `Adicionais: ${names.join(", ")}`;
}

export function formatReais(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function catalogPriceLabel(product: {
  price: number;
  customizable: boolean;
  optionGroups?: {
    exclusiveSet?: string | null;
    price?: number;
    options: { extraPrice: number }[];
  }[];
}) {
  if (!product.customizable) return formatReais(product.price);
  const sizePrices = (product.optionGroups ?? [])
    .filter((group) => group.exclusiveSet)
    .map((group) => Number(group.price ?? 0))
    .filter((value) => value > 0);
  if (sizePrices.length) {
    const from = Math.min(...sizePrices);
    const varied = sizePrices.some((value) => value !== from);
    return varied ? `a partir de ${formatReais(from)}` : formatReais(from);
  }
  if (product.price > 0) return formatReais(product.price);
  const extras = (product.optionGroups ?? []).flatMap((group) =>
    group.options.map((option) => option.extraPrice),
  );
  const candidates = [product.price, ...extras].filter((value) => value > 0);
  const from = candidates.length ? Math.min(...candidates) : 0;
  return `a partir de ${formatReais(from)}`;
}

export function formatPrepDuration(minutes: number) {
  const value = Math.max(1, Math.round(minutes));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!rest) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${rest} min`;
}

export function formatDate(value: string) {
  return dayjs(value).format("DD/MM HH:mm");
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu p/ entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  received: "orange",
  preparing: "gold",
  ready: "green",
  out_for_delivery: "blue",
  delivered: "success",
  cancelled: "red",
};

export function nextStatus(
  status: OrderStatus,
  fulfillment: "delivery" | "pickup",
): OrderStatus | undefined {
  if (status === "received") return "preparing";
  if (status === "preparing") return "ready";
  if (status === "ready") {
    return fulfillment === "pickup" ? "delivered" : "out_for_delivery";
  }
  if (status === "out_for_delivery") return "delivered";
  return undefined;
}

export const PAYMENT_LABEL: Record<NonNullable<Order["paymentMethod"]>, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  credit: "Crédito",
  debit: "Débito",
};

export const PAYMENT_COLOR: Record<NonNullable<Order["paymentMethod"]>, string> = {
  pix: "cyan",
  cash: "green",
  card: "purple",
  credit: "purple",
  debit: "blue",
};
