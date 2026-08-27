import { formatBRL, formatReais } from "../lib/money.js";
import { sendButtons, sendList, sendLocationRequest, sendText } from "../lib/whatsapp.js";
import {
  createOrder,
  findLatestOrder,
  findOrderByCode,
  getConversation,
  getProduct,
  getStore,
  listProducts,
  saveConversation,
  upsertCustomer,
} from "../data/repository.js";
import { describeOrderStatus, formatPrepDuration } from "./status.js";
import { resolveDeliveryFee } from "./deliveryFee.js";
import {
  ADDON_GROUP_ID,
  assembledName,
  flavorShareLine,
  groupPrompt,
  isCustomizable,
  nextAssembly,
  optionDescription,
  selectionKey,
  soleGroupPick,
  unitPriceCents,
  variantPriceLabel,
  variantPrompt,
  activeGroups,
} from "./assemble.js";
import type {
  CartItem,
  CartSelection,
  ConversationContext,
  ConversationState,
  Customer,
  DeliveryNeighborhood,
  Fulfillment,
  PaymentMethod,
  Product,
  ProductOptionGroup,
  Store,
} from "../types.js";

const GREETING_KEYS = ["oi", "olá", "ola", "menu", "inicio", "início", "hi", "hello"];
const CANCEL_KEYS = ["cancelar", "sair"];
const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;

function isConversationIdle(lastMessageAt: string | undefined, minutes: number) {
  if (!lastMessageAt) return false;
  const last = Date.parse(lastMessageAt);
  if (!Number.isFinite(last)) return false;
  const limit = Math.max(1, minutes) * 60 * 1000;
  return Date.now() - last > limit;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function findVariant(
  incoming: string,
  normalized: string,
  groups: ProductOptionGroup[],
) {
  if (incoming.startsWith("var:")) {
    const match = groups.find((group) => group.id === incoming.slice(4));
    if (match) return match;
  }
  return groups.find((group) => {
    const name = normalize(group.name);
    return normalized === name || normalized.startsWith(`${name} `);
  });
}

function parseQuantity(raw: string) {
  const text = raw.replace(/^qty:/i, "").trim();
  const match = text.match(/\d{1,3}/);
  if (!match) return null;
  const quantity = Number(match[0]);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  return quantity;
}

function emptyContext(): ConversationContext {
  return { cart: [] };
}

function cartTotal(context: ConversationContext) {
  return context.cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
}

function itemHeading(item: Pick<CartItem, "name" | "catalogName" | "catalogDescription">) {
  const title = item.catalogName?.trim() || item.name;
  const lines = [`*${title}*`];
  const description = item.catalogDescription?.trim();
  if (description) lines.push(description);
  return { title, lines };
}

function renderCartItem(item: CartItem) {
  const { title, lines } = itemHeading(item);
  const detail =
    item.name !== title ? `${item.quantity}x ${item.name}` : `${item.quantity}x`;
  lines.push(`${detail} — ${formatBRL(item.quantity * item.unitPriceCents)}`);
  if (item.notes?.trim()) lines.push(`Obs.: ${item.notes.trim()}`);
  return lines.join("\n");
}

function renderCart(context: ConversationContext) {
  if (!context.cart.length) return "Seu carrinho está vazio.";
  return `${context.cart.map(renderCartItem).join("\n\n")}\n\nSubtotal: ${formatBRL(cartTotal(context))}`;
}

function isSkipStep(incoming: string, normalized: string) {
  if (
    incoming === "skip_group" ||
    incoming === "done_options" ||
    normalized === "pular" ||
    normalized === "pronto"
  ) {
    return true;
  }
  const last = normalized.split(/[\n/|]+/).pop()?.trim() ?? "";
  return last === "pular" || last === "pronto";
}

function isSkipNote(incoming: string, normalized: string) {
  return (
    incoming === "skip_note" ||
    normalized === "pular" ||
    normalized === "sem observacao" ||
    normalized === "nenhuma"
  );
}

function clipNote(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 240);
}

function productAddons(product: Product) {
  if (!product.addonsEnabled) return [];
  return (product.addons ?? [])
    .filter((addon) => addon.active)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
}

function productHasAddons(product: Product) {
  return productAddons(product).length > 0;
}

function isSkipAddon(incoming: string, normalized: string) {
  return (
    incoming === "skip_addon" ||
    isSkipStep(incoming, normalized) ||
    normalized === "sem adicional" ||
    normalized === "nenhum" ||
    normalized === "nao"
  );
}

function commitDraftToCart(context: ConversationContext) {
  const added = context.draftItem;
  if (!added) return null;
  const already = context.cart.find(
    (item) => selectionKey(item) === selectionKey(added),
  );
  if (already) already.quantity += added.quantity;
  else context.cart.push(added);
  context.draftItem = undefined;
  context.selectedProductId = undefined;
  context.draftSelections = [];
  context.optionGroupIndex = undefined;
  return added;
}

async function showCartAfterAdd(to: string, context: ConversationContext) {
  await sendButtons(
    to,
    `Adicionado.\n\n${renderCart(context)}`,
    [
      { id: "order", title: "Adicionar mais" },
      { id: "checkout", title: "Fechar pedido" },
      { id: "clear_cart", title: "Limpar carrinho" },
    ],
  );
}

async function askItemNote(to: string, item: CartItem) {
  const { title, lines } = itemHeading(item);
  await sendButtons(
    to,
    [
      "Observação para este item?",
      ...lines,
      item.name !== title ? item.name : null,
      "Ex.: sem cebola, bem assada.",
      "Se não quiser, toque em *Pular*.",
    ]
      .filter(Boolean)
      .join("\n"),
    [{ id: "skip_note", title: "Pular" }],
  );
}

async function askOrderNote(to: string) {
  await sendButtons(
    to,
    "Observação para o *pedido inteiro*?\nEx.: interfone 12, não bater na porta.\nSe não quiser, toque em *Pular*.",
    [{ id: "skip_note", title: "Pular" }],
  );
}

async function askFulfillment(to: string, store: { deliveryEnabled: boolean; pickupEnabled: boolean }, cartText: string) {
  const buttons = [];
  if (store.deliveryEnabled) buttons.push({ id: "fulfillment:delivery", title: "Entrega" });
  if (store.pickupEnabled) buttons.push({ id: "fulfillment:pickup", title: "Retirada" });
  await sendButtons(to, `${cartText}\n\nComo você prefere receber?`, buttons);
}

async function askNeighborhoods(to: string, store: Store) {
  const zones = [...(store.neighborhoods ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR"),
  );
  const sections = [];
  for (let index = 0; index < zones.length; index += 10) {
    const chunk = zones.slice(index, index + 10);
    sections.push({
      title: zones.length > 10 ? `Bairros ${Math.floor(index / 10) + 1}` : "Bairros",
      rows: chunk.map((zone) => ({
        id: `nbh:${zone.id}`,
        title: zone.name,
        description: formatBRL(zone.feeCents),
      })),
    });
  }
  await sendList(
    to,
    "Escolha o bairro da entrega. A taxa já aparece em cada opção.",
    "Ver bairros",
    sections,
  );
}

function findNeighborhood(
  incoming: string,
  normalized: string,
  zones: DeliveryNeighborhood[],
) {
  if (incoming.startsWith("nbh:")) {
    const id = incoming.slice(4);
    return zones.find((zone) => zone.id === id) ?? null;
  }
  return zones.find((zone) => normalize(zone.name) === normalized) ?? null;
}

async function goToAddress(to: string, zone?: DeliveryNeighborhood | null) {
  const intro = [
    zone
      ? `Bairro *${zone.name}* · taxa ${formatBRL(zone.feeCents)}.`
      : null,
    "Qual o endereço completo da entrega?",
    "Você também pode *enviar sua localização*.",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await sendLocationRequest(to, intro);
  } catch (error) {
    console.warn("WhatsApp: location request indisponível, usando texto", error);
    await sendText(to, intro);
  }
}

function formatLocation(location: {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}) {
  const maps = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  const label = location.address?.trim() || location.name?.trim();
  return label ? `${label}\n${maps}` : maps;
}

function resolveAddress(input: {
  text: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}) {
  if (input.location) return formatLocation(input.location);
  const text = input.text.trim();
  return text || null;
}

const PAYMENT_ROWS = [
  { id: "pay:pix", title: "Pix" },
  { id: "pay:cash", title: "Dinheiro" },
  { id: "pay:credit", title: "Cartão crédito" },
  { id: "pay:debit", title: "Cartão débito" },
];

async function askPayment(to: string, intro = "Como deseja pagar?") {
  await sendList(to, intro, "Ver opções", [
    { title: "Pagamento", rows: PAYMENT_ROWS },
  ]);
}

function parsePayment(incoming: string, normalized: string): PaymentMethod | "card_ambiguous" | null {
  const raw = incoming.startsWith("pay:") ? incoming.slice(4) : normalized;
  const value = normalize(raw.replace(/_/g, " "));
  if (value === "pix") return "pix";
  if (value === "cash" || value === "dinheiro") return "cash";
  if (
    value === "credit" ||
    value === "credito" ||
    value === "cartao credito" ||
    value === "cartao de credito"
  ) {
    return "credit";
  }
  if (
    value === "debit" ||
    value === "debito" ||
    value === "cartao debito" ||
    value === "cartao de debito"
  ) {
    return "debit";
  }
  if (value === "card" || value === "cartao") return "card_ambiguous";
  return null;
}

function paymentLabel(method: PaymentMethod) {
  if (method === "pix") return "Pix";
  if (method === "cash") return "Dinheiro";
  if (method === "credit") return "Cartão crédito";
  if (method === "debit") return "Cartão débito";
  return "Cartão";
}

function parseChangeCents(text: string): number | null {
  const normalized = normalize(text).replace(/[!?.,]+$/g, "").trim();
  if (["sem troco", "nao precisa", "zero", "0"].includes(normalized)) {
    return 0;
  }
  const compact = text.replace(/r\$/gi, "").trim();
  if (!compact) return null;
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let numeric = compact.replace(/[^\d,.-]/g, "");
  if (hasComma && hasDot) {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    numeric = numeric.replace(",", ".");
  }
  const value = Number(numeric);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

async function askChange(to: string, totalCents: number) {
  await sendText(
    to,
    `Troco para quanto?\nO total é *${formatBRL(totalCents)}*.\nSe não precisar, envie *sem troco*.`,
  );
}

function orderTotalCents(store: Store, context: ConversationContext) {
  const deliveryFee =
    context.fulfillment === "delivery"
      ? resolveDeliveryFee(store, {
          neighborhoodId: context.neighborhoodId,
          address: context.addressText,
        }).cents
      : 0;
  return cartTotal(context) + deliveryFee;
}

async function showWelcome(to: string, storeName: string) {
  await sendButtons(
    to,
    [
      `Olá! Bem-vindo à *${storeName}*.`,
      "Posso te ajudar com o cardápio, um novo pedido ou o status de um pedido.",
      'Caso queira encerrar a conversa sem finalizar o pedido, digite *Sair*.',
    ].join("\n"),
    [
      { id: "menu", title: "Ver cardápio" },
      { id: "order", title: "Fazer pedido" },
      { id: "status", title: "Status do pedido" },
    ],
  );
}

async function showMenu(to: string, intro = "Escolha um item do cardápio:") {
  const products = await listProducts();
  const grouped = new Map<string, typeof products>();
  for (const product of products) {
    const list = grouped.get(product.categoryName) ?? [];
    list.push(product);
    grouped.set(product.categoryName, list);
  }

  const sections = [...grouped.entries()].map(([title, items]) => ({
    title,
    rows: items.map((product) => ({
      id: `product:${product.id}`,
      title: product.name,
      description: product.customizable
        ? product.description || undefined
        : [formatReais(product.price), product.description].filter(Boolean).join(" · ") ||
          undefined,
    })),
  }));

  if (!sections.length) {
    await sendText(to, "O cardápio ainda não foi cadastrado.");
    return;
  }

  await sendList(to, intro, "Ver itens", sections);
}

async function askAssembly(
  to: string,
  product: Product,
  context: ConversationContext,
) {
  const next = nextAssembly(product, context.draftSelections ?? []);
  if (next.type === "done") return true;

  if (next.type === "variant") {
    await sendList(to, variantPrompt(product), "Tamanhos", [
      {
        title: "Tamanhos",
        rows: next.groups.slice(0, 10).map((group) => ({
          id: `var:${group.id}`,
          title: group.name.slice(0, 24),
          description: variantPriceLabel(product, group),
        })),
      },
    ]);
    return false;
  }

  const group = next.group;
  return askGroupOptions(to, product, group, context.draftSelections ?? []);
}

async function askGroupOptions(
  to: string,
  product: Product,
  group: ProductOptionGroup,
  drafts: CartSelection[],
) {
  const current = drafts.find((item) => item.groupId === group.id);
  const picked = current?.options.map((option) => option.id) ?? [];
  const remaining = group.options.filter((option) => !picked.includes(option.id));
  if (!remaining.length) return true;

  await sendList(to, groupPrompt(product, group, picked), "Escolher", [
    {
      title: group.name.slice(0, 24),
      rows: remaining.slice(0, 10).map((option) => ({
        id: `opt:${option.id}`,
        title: option.name.slice(0, 24),
        ...(group.maxSelect > 1 || group.exclusiveSet?.trim()
          ? {}
          : { description: optionDescription(option.extraPrice) }),
      })),
    },
  ]);
  if (!group.required && picked.length === 0) {
    await sendButtons(to, "Esta etapa é opcional.", [
      { id: "skip_group", title: "Pular" },
    ]);
  }
  return false;
}

function groupWantingMore(product: Product, drafts: CartSelection[]) {
  const groups = activeGroups(product);
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index];
    const group = groups.find((item) => item.id === draft.groupId);
    if (!group || draft.skipped || draft.options.length >= group.maxSelect) continue;
    const picked = new Set(draft.options.map((option) => option.id));
    if (group.options.some((option) => !picked.has(option.id))) return group;
  }
  return null;
}

async function askQuantity(to: string, product: Product, extras: CartSelection[]) {
  const variant = assembledName(product, extras);
  const price = unitPriceCents(product, extras);
  const heading = [
    `*${product.name}*`,
    product.description?.trim() || null,
    variant !== product.name ? variant : null,
    formatReais(price / 100),
  ]
    .filter(Boolean)
    .join("\n");
  await sendButtons(
    to,
    `${heading}\nQuantas unidades?\nOu digite um número de 1 a 20.`,
    [
      { id: "qty:1", title: "1" },
      { id: "qty:2", title: "2" },
      { id: "qty:3", title: "3" },
    ],
  );
}

async function askAddons(to: string, product: Product) {
  const addons = productAddons(product);
  const rows = addons.slice(0, 10).map((addon) => ({
    id: `addon:${addon.id}`,
    title: addon.name.slice(0, 24),
    description: `+ ${formatReais(addon.price)}`,
  }));
  if (rows.length < 10) {
    rows.push({
      id: "skip_addon",
      title: "Sem adicional",
      description: "Pular esta etapa",
    });
  }
  await sendList(to, `*${product.name}*\nQuer um adicional? (opcional)`, "Adicionais", [
    {
      title: "Adicionais",
      rows,
    },
  ]);
  await sendButtons(to, "Pode pular se não quiser adicional.", [
    { id: "skip_addon", title: "Sem adicional" },
  ]);
}

async function continueProductFlow(
  to: string,
  product: Product,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
) {
  if (isCustomizable(product)) {
    await persist("awaiting_option", context);
    await askAssembly(to, product, context);
    return;
  }
  await persist("awaiting_quantity", context);
  await askQuantity(to, product, context.draftSelections ?? []);
}

async function finishOrder(
  to: string,
  store: Store,
  customer: Customer,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
) {
  if (!context.fulfillment || !context.paymentMethod) {
    await sendText(to, "Escolha Pix, dinheiro, cartão crédito ou débito.");
    await askPayment(to);
    return;
  }

  const deliveryFee = resolveDeliveryFee(store, {
    neighborhoodId: context.neighborhoodId,
    address: context.fulfillment === "delivery" ? context.addressText : undefined,
  });
  const order = await createOrder({
    customer,
    fulfillment: context.fulfillment,
    paymentMethod: context.paymentMethod,
    changeForCents: context.paymentMethod === "cash" ? (context.changeForCents ?? 0) : null,
    addressText: context.addressText,
    notes: context.orderNotes ?? null,
    deliveryFeeCents: context.fulfillment === "delivery" ? deliveryFee.cents : 0,
    items: context.cart,
  });

  await persist("welcome", emptyContext());
  const feeLine =
    context.fulfillment !== "delivery"
      ? "Retirada no local"
      : deliveryFee.neighborhood
        ? `Taxa de entrega (${deliveryFee.neighborhood.name}): ${formatBRL(deliveryFee.cents)}`
        : deliveryFee.cents
          ? `Taxa de entrega: ${formatBRL(deliveryFee.cents)}`
          : "Entrega sem taxa";
  const changeLine =
    context.paymentMethod === "cash"
      ? context.changeForCents
        ? `Troco para ${formatBRL(context.changeForCents)}`
        : "Sem troco"
      : "";
  await sendText(
    to,
    [
      `Pedido *#${order.code}* confirmado!`,
      renderCart(context),
      feeLine,
      `Pagamento: ${paymentLabel(context.paymentMethod)}`,
      changeLine,
      `Total: *${formatBRL(order.totalCents)}*`,
      context.addressText ? `Entrega: ${context.addressText}` : "",
      context.orderNotes ? `Obs. do pedido: ${context.orderNotes}` : "",
      "Assim que o status mudar, eu te aviso por aqui.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export async function handleIncomingMessage(input: {
  from: string;
  name?: string;
  text: string;
  replyId?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}) {
  const store = await getStore();
  const customer = await upsertCustomer(input.from, input.name);
  const existing = await getConversation(customer.id);
  const state: ConversationState = existing?.state ?? "welcome";
  const context = existing?.context ?? emptyContext();
  const incoming = input.replyId || input.text;
  const normalized = normalize(incoming);
  const command = normalized.replace(/[!?.,]+$/g, "").trim();

  const persist = (nextState: ConversationState, nextContext = context) =>
    saveConversation(customer, nextState, nextContext);

  if (CANCEL_KEYS.includes(command)) {
    await persist("welcome", emptyContext());
    await sendText(
      input.from,
      "Atendimento encerrado. Obrigado pelo contato! Quando quiser pedir de novo, é só mandar uma mensagem.",
    );
    return;
  }

  const idleMinutes = store.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (isConversationIdle(existing?.lastMessageAt, idleMinutes)) {
    await persist("welcome", emptyContext());
    await showWelcome(input.from, store.name);
    return;
  }

  if (state === "awaiting_item_note" && context.draftItem) {
    const notes = isSkipNote(incoming, normalized) ? null : clipNote(input.text);
    if (!isSkipNote(incoming, normalized) && !notes) {
      await askItemNote(input.from, context.draftItem);
      return;
    }
    const added = context.draftItem;
    added.notes = notes;
    commitDraftToCart(context);
    await persist("cart", context);
    await showCartAfterAdd(input.from, context);
    return;
  }

  if (state === "awaiting_order_note") {
    if (!context.cart.length) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:");
      return;
    }
    const notes = isSkipNote(incoming, normalized) ? null : clipNote(input.text);
    if (!isSkipNote(incoming, normalized) && !notes) {
      await askOrderNote(input.from);
      return;
    }
    context.orderNotes = notes;
    await persist("awaiting_fulfillment", context);
    await askFulfillment(input.from, store, renderCart(context));
    return;
  }

  if (["menu", "ver cardapio", "cardapio"].includes(normalized)) {
    await persist("awaiting_product", context);
    await showMenu(input.from);
    return;
  }

  if (["order", "fazer pedido", "pedir"].includes(normalized)) {
    await persist("awaiting_product", context);
    await showMenu(input.from, "Vamos montar seu pedido. Escolha o primeiro item:");
    return;
  }

  if (["status", "status do pedido", "meu pedido", "rastrear"].includes(normalized)) {
    const latest = await findLatestOrder(customer.id);
    if (latest) {
      await persist("welcome", context);
      const lines = [
        `Seu último pedido *#${latest.code}* está *${describeOrderStatus(latest.status)}*.`,
      ];
      if (latest.status === "preparing" && latest.prepMinutes) {
        lines.push(`Tempo estimado: ${formatPrepDuration(latest.prepMinutes)}`);
      }
      lines.push(`Total: ${formatBRL(latest.totalCents)}.`);
      await sendText(input.from, lines.join("\n"));
      return;
    }
    await persist("awaiting_order_code", context);
    await sendText(input.from, "Me envie o código do pedido (ex.: A7K2).");
    return;
  }

  if (GREETING_KEYS.includes(normalized) || state === "welcome") {
    if (state === "welcome" && !GREETING_KEYS.includes(normalized) && input.replyId) {
      // fall through to other handlers
    } else if (state === "welcome" && !input.replyId) {
      await persist("welcome", context);
      await showWelcome(input.from, store.name);
      return;
    } else if (GREETING_KEYS.includes(normalized)) {
      await persist("welcome", context);
      await showWelcome(input.from, store.name);
      return;
    }
  }

  if (state === "awaiting_option" && context.selectedProductId) {
    const product = await getProduct(context.selectedProductId);
    if (!product || !isCustomizable(product)) {
      await persist("awaiting_product", context);
      await showMenu(input.from);
      return;
    }

    const drafts = context.draftSelections ?? [];
    context.draftSelections = drafts;
    const pending = nextAssembly(product, drafts);

    const goNext = async () => {
      const following = nextAssembly(product, drafts);
      if (following.type === "done") {
        context.optionGroupIndex = undefined;
        await persist("awaiting_quantity", context);
        await askQuantity(input.from, product, drafts);
        return;
      }
      await persist("awaiting_option", context);
      const finished = await askAssembly(input.from, product, context);
      if (finished) {
        context.optionGroupIndex = undefined;
        await persist("awaiting_quantity", context);
        await askQuantity(input.from, product, drafts);
      }
    };

    if (incoming === "more_options" || normalized === "mais um") {
      const group = groupWantingMore(product, drafts);
      if (!group) {
        await goNext();
        return;
      }
      await persist("awaiting_option", context);
      const finished = await askGroupOptions(input.from, product, group, drafts);
      if (finished) await goNext();
      return;
    }

    if (incoming.startsWith("opt:")) {
      const optionId = incoming.slice(4);
      const openGroup = groupWantingMore(product, drafts);
      const group =
        (openGroup?.options.some((item) => item.id === optionId)
          ? openGroup
          : null) ??
        (pending.type === "options" &&
        pending.group.options.some((item) => item.id === optionId)
          ? pending.group
          : null) ??
        activeGroups(product).find(
          (item) =>
            item.options.some((option) => option.id === optionId) &&
            drafts.some((draft) => draft.groupId === item.id),
        ) ??
        activeGroups(product).find((item) =>
          item.options.some((option) => option.id === optionId),
        );
      const option = group?.options.find((item) => item.id === optionId);
      if (!group || !option) {
        await sendText(input.from, "Não encontrei essa opção.");
        await askAssembly(input.from, product, context);
        return;
      }
      const current =
        drafts.find((item) => item.groupId === group.id) ??
        {
          groupId: group.id,
          groupName: group.name,
          priceMode: group.priceMode,
          options: [] as CartSelection["options"],
        };
      if (!drafts.some((item) => item.groupId === group.id)) drafts.push(current);
      if (!current.options.some((item) => item.id === option.id)) {
        current.options.push({
          id: option.id,
          name: option.name,
          extraPrice: option.extraPrice,
        });
      }
      await persist("awaiting_option", context);

      if (current.options.length >= group.maxSelect) {
        await goNext();
        return;
      }
      if (current.options.length >= Math.max(group.required ? 1 : 0, group.minSelect)) {
        const shares =
          flavorShareLine(
            product.name,
            current.options.map((item) => item.name),
          ) || current.options.map((item) => item.name).join(" + ");
        await sendButtons(
          input.from,
          `*${group.name}:*\n${shares}`,
          [
            { id: "more_options", title: "Mais um" },
            { id: "done_options", title: "Pronto" },
          ],
        );
        return;
      }
      await askGroupOptions(input.from, product, group, drafts);
      return;
    }

    if (pending.type === "variant") {
      const group = findVariant(incoming, normalized, pending.groups);
      if (!group) {
        await sendText(input.from, "Escolha um tamanho da lista.");
        await askAssembly(input.from, product, context);
        return;
      }
      if (!drafts.some((item) => item.groupId === group.id)) {
        drafts.push({
          groupId: group.id,
          groupName: group.name,
          priceMode: group.priceMode,
          options: soleGroupPick(group),
        });
      }
      await goNext();
      return;
    }

    if (pending.type === "options") {
      const group = pending.group;
      const current =
        drafts.find((item) => item.groupId === group.id) ??
        {
          groupId: group.id,
          groupName: group.name,
          priceMode: group.priceMode,
          options: [] as CartSelection["options"],
        };
      if (!drafts.some((item) => item.groupId === group.id)) drafts.push(current);

      if (isSkipStep(incoming, normalized)) {
        if (group.required && current.options.length < Math.max(1, group.minSelect)) {
          await sendText(
            input.from,
            `Escolha pelo menos ${Math.max(1, group.minSelect)} em *${group.name}*.`,
          );
          await askAssembly(input.from, product, context);
          return;
        }
        current.skipped = current.options.length === 0;
        await goNext();
        return;
      }

      const finished = await askAssembly(input.from, product, context);
      if (finished) await goNext();
      return;
    }

    await goNext();
    return;
  }

  if (state === "awaiting_addon" && !incoming.startsWith("product:")) {
    const product = context.selectedProductId
      ? await getProduct(context.selectedProductId)
      : null;
    if (!product || !productHasAddons(product)) {
      if (product) {
        await continueProductFlow(input.from, product, context, persist);
        return;
      }
      await persist("awaiting_product", context);
      await showMenu(input.from, "Escolha um item do cardápio:");
      return;
    }

    if (isSkipAddon(incoming, normalized)) {
      await continueProductFlow(input.from, product, context, persist);
      return;
    }

    const addons = productAddons(product);
    const addon = incoming.startsWith("addon:")
      ? addons.find((item) => item.id === incoming.slice("addon:".length))
      : addons.find((item) => normalize(item.name) === normalized);

    if (!addon) {
      await sendText(input.from, "Escolha um adicional da lista ou toque em Sem adicional.");
      await persist("awaiting_addon", context);
      await askAddons(input.from, product);
      return;
    }

    context.draftSelections = [
      {
        groupId: ADDON_GROUP_ID,
        groupName: "Adicional",
        priceMode: "addon",
        options: [{ id: addon.id, name: addon.name, extraPrice: addon.price }],
      },
    ];
    await continueProductFlow(input.from, product, context, persist);
    return;
  }

  if (incoming.startsWith("product:") || state === "awaiting_product") {
    const productId = incoming.startsWith("product:")
      ? incoming.slice("product:".length)
      : null;
    const product = productId
      ? await getProduct(productId)
      : (await listProducts()).find((item) => normalize(item.name) === normalized);

    if (!product) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Não encontrei esse item. Escolha na lista:");
      return;
    }

    context.selectedProductId = product.id;
    context.draftSelections = [];
    context.optionGroupIndex = 0;

    if (productHasAddons(product)) {
      await persist("awaiting_addon", context);
      await askAddons(input.from, product);
      return;
    }

    await continueProductFlow(input.from, product, context, persist);
    return;
  }

  if (state === "awaiting_quantity") {
    const quantity = parseQuantity(incoming);
    const product = context.selectedProductId
      ? await getProduct(context.selectedProductId)
      : null;

    if (!product || quantity == null) {
      await sendText(input.from, "Envie um número de 1 a 20, ou toque em 1, 2 ou 3.");
      return;
    }

    const extras = context.draftSelections ?? [];
    context.draftItem = {
      productId: product.id,
      name: assembledName(product, extras),
      catalogName: product.name,
      catalogDescription: product.description,
      quantity,
      unitPriceCents: unitPriceCents(product, extras),
      extras,
    };
    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = undefined;

    if (product.notesEnabled) {
      await persist("awaiting_item_note", context);
      await askItemNote(input.from, context.draftItem);
      return;
    }

    const added = commitDraftToCart(context);
    await persist("cart", context);
    if (added) await showCartAfterAdd(input.from, context);
    return;
  }

  if (normalized === "clear_cart" || normalized === "limpar carrinho") {
    context.cart = [];
    await persist("welcome", context);
    await sendText(input.from, "Carrinho limpo. É só chamar quando quiser pedir de novo.");
    return;
  }

  if (normalized === "checkout" || normalized === "fechar pedido" || state === "cart") {
    if (!context.cart.length) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:");
      return;
    }
    if (normalized === "checkout" || normalized === "fechar pedido") {
      await persist("awaiting_order_note", context);
      await askOrderNote(input.from);
      return;
    }
  }

  if (state === "awaiting_fulfillment" || incoming.startsWith("fulfillment:")) {
    const fulfillment = (
      incoming.startsWith("fulfillment:") ? incoming.slice("fulfillment:".length) : normalized
    ) as Fulfillment | string;
    const resolved: Fulfillment | null =
      fulfillment === "delivery" || fulfillment === "entrega"
        ? "delivery"
        : fulfillment === "pickup" || fulfillment === "retirada"
          ? "pickup"
          : null;

    if (!resolved) {
      await sendText(input.from, "Escolha *Entrega* ou *Retirada*.");
      return;
    }

    context.fulfillment = resolved;
    if (resolved === "delivery") {
      const zones = store.neighborhoods ?? [];
      if (zones.length) {
        context.neighborhoodId = undefined;
        context.neighborhoodName = undefined;
        await persist("awaiting_neighborhood", context);
        await askNeighborhoods(input.from, store);
        return;
      }
      await persist("awaiting_address", context);
      await goToAddress(input.from);
      return;
    }

    await persist("awaiting_payment", context);
    await askPayment(input.from);
    return;
  }

  if (state === "awaiting_neighborhood") {
    const zone = findNeighborhood(incoming, normalized, store.neighborhoods ?? []);
    if (!zone) {
      await sendText(input.from, "Escolha um bairro da lista.");
      await askNeighborhoods(input.from, store);
      return;
    }
    context.neighborhoodId = zone.id;
    context.neighborhoodName = zone.name;
    await persist("awaiting_address", context);
    await goToAddress(input.from, zone);
    return;
  }

  if (state === "awaiting_address") {
    const address = resolveAddress(input);
    if (!address) {
      await sendText(
        input.from,
        "Envie o endereço em texto ou compartilhe sua localização.",
      );
      return;
    }
    context.addressText = address;
    await persist("awaiting_payment", context);
    await askPayment(input.from, "Endereço anotado. Como deseja pagar?");
    return;
  }

  if (state === "awaiting_change") {
    const totalCents = orderTotalCents(store, context);
    const change = parseChangeCents(input.text);
    if (change == null) {
      await sendText(input.from, "Envie o valor do troco, por exemplo *100*, ou *sem troco*.");
      return;
    }
    if (change > 0 && change < totalCents) {
      await sendText(
        input.from,
        `O troco precisa ser pelo menos o total de *${formatBRL(totalCents)}*.`,
      );
      await askChange(input.from, totalCents);
      return;
    }
    context.changeForCents = change;
    context.paymentMethod = "cash";
    await finishOrder(input.from, store, customer, context, persist);
    return;
  }

  if (state === "awaiting_payment" || incoming.startsWith("pay:")) {
    const payment = parsePayment(incoming, normalized);
    if (payment === "card_ambiguous") {
      await persist("awaiting_payment", context);
      await sendButtons(input.from, "Qual cartão?", [
        { id: "pay:credit", title: "Crédito" },
        { id: "pay:debit", title: "Débito" },
      ]);
      return;
    }

    if (!payment || !context.fulfillment) {
      await sendText(input.from, "Escolha Pix, dinheiro, cartão crédito ou débito.");
      await askPayment(input.from);
      return;
    }

    context.paymentMethod = payment;
    if (payment === "cash") {
      const totalCents = orderTotalCents(store, context);
      await persist("awaiting_change", context);
      await askChange(input.from, totalCents);
      return;
    }

    context.changeForCents = undefined;
    await finishOrder(input.from, store, customer, context, persist);
    return;
  }

  if (state === "awaiting_order_code") {
    const order =
      (await findOrderByCode(input.text.trim(), customer.id)) ??
      (await findOrderByCode(input.text.trim()));
    if (!order) {
      await sendText(input.from, "Não achei esse código. Confira e envie de novo.");
      return;
    }
    await persist("welcome", context);
    const lines = [
      `Pedido *#${order.code}*: *${describeOrderStatus(order.status)}*.`,
    ];
    if (order.status === "preparing" && order.prepMinutes) {
      lines.push(`Tempo estimado: ${formatPrepDuration(order.prepMinutes)}`);
    }
    lines.push(`Total: ${formatBRL(order.totalCents)}.`);
    await sendText(input.from, lines.join("\n"));
    return;
  }

  await persist("welcome", context);
  await showWelcome(input.from, store.name);
}
