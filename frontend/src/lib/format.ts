import dayjs from "dayjs";
import type { Order, OrderStatus } from "../types";

export function formatBRL(cents: number) {
  return formatReais(cents / 100);
}

const ADDON_GROUP_ID = "__addon__";
const CRUST_GROUP_ID = "__crust__";

export function addonLabel(
  extras?: { groupId: string; options?: { name: string }[] }[] | null,
) {
  const names = (extras ?? [])
    .filter((item) => item.groupId === ADDON_GROUP_ID)
    .flatMap((item) => (item.options ?? []).map((option) => option.name).filter(Boolean));
  if (!names.length) return null;
  return `Adicionais: ${names.join(", ")}`;
}

export function crustLabel(
  extras?: { groupId: string; options?: { name: string }[] }[] | null,
) {
  const names = (extras ?? [])
    .filter((item) => item.groupId === CRUST_GROUP_ID)
    .flatMap((item) => (item.options ?? []).map((option) => option.name).filter(Boolean));
  if (!names.length) return null;
  return `Borda: ${names.join(", ")}`;
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

export function formatReceiptDate(value: string) {
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export function cnpjDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function formatCnpj(value: string) {
  const digits = cnpjDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu p/ entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Rótulo do botão/ação que avança para o status. */
export function statusActionLabel(status: OrderStatus) {
  if (status === "accepted") return "Aceitar";
  if (status === "preparing") return "Em preparo";
  return STATUS_LABEL[status];
}

const CONVERSATION_STATE_LABEL: Record<string, string> = {
  welcome: "Início",
  awaiting_product: "Escolhendo item",
  awaiting_addon: "Adicionais",
  awaiting_crust: "Borda",
  awaiting_option: "Montando item",
  awaiting_quantity: "Quantidade",
  awaiting_item_note: "Obs. do item",
  cart: "Carrinho",
  awaiting_order_note: "Obs. da entrega",
  awaiting_fulfillment: "Entrega ou retirada",
  awaiting_neighborhood: "Bairro",
  awaiting_address: "Endereço",
  awaiting_payment: "Pagamento",
  awaiting_change: "Troco",
  awaiting_order_code: "Consultando pedido",
};

export function conversationStateLabel(state: string) {
  return CONVERSATION_STATE_LABEL[state] ?? state;
}

export function formatPhoneDisplay(raw?: string | null) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const subscriber = local.slice(2);
  // Celular com 9º dígito: (77) 99817-0218
  if (local.length === 11 && subscriber.startsWith("9")) {
    return `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
  }
  // Formato antigo sem o 9: (77) 9 9817-0218
  if (local.length === 10) {
    return `(${ddd}) 9 ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  }
  return raw?.trim() || digits;
}

export const STATUS_COLOR: Record<OrderStatus, string> = {
  received: "orange",
  accepted: "blue",
  preparing: "gold",
  ready: "green",
  out_for_delivery: "cyan",
  delivered: "success",
  cancelled: "red",
};

export function nextStatus(
  status: OrderStatus,
  fulfillment: "delivery" | "pickup",
): OrderStatus | undefined {
  if (status === "received") return "accepted";
  if (status === "accepted") return "preparing";
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

export function cashChangeLabel(changeForCents: number, totalCents: number) {
  if (!changeForCents) return "Sem troco";
  const dueCents = Math.max(0, changeForCents - totalCents);
  return `Troco p/ ${formatBRL(changeForCents)} = ${formatBRL(dueCents)}`;
}

export const PAYMENT_COLOR: Record<NonNullable<Order["paymentMethod"]>, string> = {
  pix: "cyan",
  cash: "green",
  card: "purple",
  credit: "purple",
  debit: "blue",
};
