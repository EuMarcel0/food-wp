import dayjs from "dayjs";
import type { OrderStatus } from "../types";

export function formatBRL(cents: number) {
  return formatReais(cents / 100);
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
  optionGroups?: { options: { extraPrice: number }[] }[];
}) {
  if (!product.customizable) return formatReais(product.price);
  const extras = (product.optionGroups ?? []).flatMap((group) =>
    group.options.map((option) => option.extraPrice),
  );
  const candidates = [product.price, ...extras].filter((value) => value > 0);
  const from = candidates.length ? Math.min(...candidates) : 0;
  return `a partir de ${formatReais(from)}`;
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

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: "preparing",
  preparing: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "delivered",
};
