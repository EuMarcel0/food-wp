import { formatReais } from "../lib/money.js";
import type {
  CartItem,
  CartSelection,
  Product,
  ProductOptionGroup,
} from "../types.js";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

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

function optionNames(group: ProductOptionGroup) {
  return new Set(group.options.map((option) => normalizeName(option.name)));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let inter = 0;
  for (const name of left) if (right.has(name)) inter += 1;
  return inter / new Set([...left, ...right]).size;
}

export function exclusiveClusters(groups: ProductOptionGroup[]) {
  const used = new Set<string>();
  const clusters: ProductOptionGroup[][] = [];
  const bySet = new Map<string, ProductOptionGroup[]>();

  for (const group of groups) {
    const key = group.exclusiveSet?.trim();
    if (!key) continue;
    const list = bySet.get(key) ?? [];
    list.push(group);
    bySet.set(key, list);
  }

  for (const group of groups) {
    if (used.has(group.id)) continue;
    const key = group.exclusiveSet?.trim();
    if (key) {
      const cluster = bySet.get(key) ?? [group];
      cluster.forEach((item) => used.add(item.id));
      clusters.push(cluster);
      continue;
    }
    const names = optionNames(group);
    const cluster = [group];
    used.add(group.id);
    for (const other of groups) {
      if (used.has(other.id) || other.exclusiveSet?.trim()) continue;
      if (jaccard(names, optionNames(other)) >= 0.5) {
        cluster.push(other);
        used.add(other.id);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

export type AssemblyNext =
  | { type: "variant"; groups: ProductOptionGroup[] }
  | { type: "options"; group: ProductOptionGroup }
  | { type: "done" };

export function nextAssembly(
  product: Product,
  drafts: CartSelection[],
): AssemblyNext {
  const groups = activeGroups(product);
  const clusters = exclusiveClusters(groups);

  for (const cluster of clusters) {
    if (cluster.length > 1) {
      const chosen = cluster.find((group) =>
        drafts.some((draft) => draft.groupId === group.id),
      );
      if (!chosen) return { type: "variant", groups: cluster };
      const group = chosen;
      const draft = drafts.find((item) => item.groupId === group.id);
      const count = draft?.options.length ?? 0;
      if (count < Math.max(group.required ? 1 : 0, group.minSelect)) {
        return { type: "options", group };
      }
      continue;
    }

    const group = cluster[0];
    const draft = drafts.find((item) => item.groupId === group.id);
    const count = draft?.options.length ?? 0;
    if (draft && count === 0 && !group.required) continue;
    if (count >= Math.max(group.required ? 1 : 0, group.minSelect) && count > 0) {
      continue;
    }
    if (group.required && count < Math.max(1, group.minSelect)) {
      return { type: "options", group };
    }
    if (!group.required && !draft) return { type: "options", group };
  }

  return { type: "done" };
}

function cheapestSum(group: ProductOptionGroup, count: number) {
  const take = Math.max(1, count);
  return group.options
    .map((option) => option.extraPrice)
    .sort((a, b) => a - b)
    .slice(0, take)
    .reduce((sum, value) => sum + value, 0);
}

export function startingPrice(product: Product) {
  if (!isCustomizable(product)) return product.price;
  let from = product.price;
  for (const cluster of exclusiveClusters(activeGroups(product))) {
    if (cluster.length > 1) {
      const mins = cluster.map((group) =>
        cheapestSum(group, Math.max(1, group.minSelect)),
      );
      const lowest = Math.min(...mins);
      if (cluster[0].priceMode === "replace") from = lowest;
      else from += lowest;
      continue;
    }
    const group = cluster[0];
    if (!group.required) continue;
    const add = cheapestSum(group, Math.max(1, group.minSelect));
    if (group.priceMode === "replace") from = add;
    else from += add;
  }
  return Math.max(0, from);
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

export function variantPrompt(product: Product, groups: ProductOptionGroup[]) {
  return [
    `*${product.name}*`,
    "Escolha o tamanho.",
    groups.map((group) => `• ${group.name}`).join("\n"),
  ].join("\n");
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
