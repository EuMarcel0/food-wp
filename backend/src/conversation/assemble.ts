import { formatReais } from "../lib/money.js";
import type {
  CartItem,
  CartSelection,
  Product,
  ProductOptionGroup,
} from "../types.js";

export function activeGroups(product: Product): ProductOptionGroup[] {
  return (product.optionGroups ?? [])
    .filter((group) => group.options.some((option) => option.active))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => ({
      ...group,
      options: group.options
        .filter((option) => option.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}

export function isCustomizable(product: Product) {
  return Boolean(product.customizable && activeGroups(product).length);
}

export function unitPriceCents(product: Product, selections: CartSelection[]) {
  let cents = Math.round(product.price * 100);
  for (const selection of selections) {
    const extra = selection.options.reduce(
      (sum, option) => sum + Math.round(option.extraPrice * 100),
      0,
    );
    if (selection.priceMode === "replace") cents = extra;
    else cents += extra;
  }
  return Math.max(0, cents);
}

export function assembledName(product: Product, selections: CartSelection[]) {
  const parts = selections
    .filter((selection) => selection.options.length)
    .map((selection) => selection.options.map((option) => option.name).join("/"));
  return parts.length ? `${product.name} · ${parts.join(" · ")}` : product.name;
}

export function selectionKey(item: Pick<CartItem, "productId" | "extras">) {
  const extras = (item.extras ?? []).map((selection) => ({
    groupId: selection.groupId,
    optionIds: selection.options.map((option) => option.id).sort(),
  }));
  return `${item.productId}:${JSON.stringify(extras)}`;
}

export function groupPrompt(product: Product, group: ProductOptionGroup, picked: string[]) {
  const chosen = group.options
    .filter((option) => picked.includes(option.id))
    .map((option) => option.name);
  const lines = [
    `*${product.name}*`,
    `Escolha: *${group.name}*`,
    group.maxSelect > 1
      ? `Pode marcar até ${group.maxSelect}${group.minSelect > 1 ? ` (mínimo ${group.minSelect})` : ""}.`
      : group.required
        ? "Escolha 1 opção."
        : "Opcional — pode pular.",
    chosen.length ? `Já escolheu: ${chosen.join(", ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function optionDescription(extraPrice: number) {
  if (extraPrice <= 0) return "Incluído";
  return `+ ${formatReais(extraPrice)}`;
}
