import { applyAutoAccept } from "../lib/autoAcceptOrder.js";
import { closedStoreMessage, dayPeriodWish, isStoreOpen } from "../lib/businessHours.js";
import { formatBRL, formatReais } from "../lib/money.js";
import { sendButtons, sendImage, sendList, sendText, sendTypingIndicator } from "../lib/whatsapp.js";
import { appendAiTurn, interpretDrinks, interpretOrder, mergeAiHints } from "./aiOrder.js";
import { enqueueWaitByUser, queueKeyForPhone } from "../lib/userQueue.js";
import { matchNeighborhoodQuery } from "./neighborhoodMatch.js";
import { looksLikeOrderChange, type OrderChangeContext } from "./orderChange.js";
import { NEW_ORDER_NO, NEW_ORDER_YES } from "../lib/orderNotify.js";
import {
  recordConversationOrder,
  findLatestOrder,
  createOrder,
  findLastContactName,
  findLastDeliveryAddress,
  findOrderByCode,
  getConversation,
  getProduct,
  getStore,
  listAddons,
  listCrusts,
  listPaymentMethods,
  listProducts,
  listSizes,
  saveConversation,
  touchConversation,
  updateCustomerName,
  updateOrderStatus,
  upsertCustomer
} from "../data/repository.js";
import {
  canCustomerCancelStatus,
  CUSTOMER_CANCEL_HINT,
  formatOrderStatusMessage,
  isOpenOrderStatus
} from "./status.js";
import { resolveDeliveryFee } from "./deliveryFee.js";
import {
  ADDON_GROUP_ID,
  CRUST_GROUP_ID,
  assembledName,
  addonLabel,
  addonOptionLabel,
  crustLabel,
  flavorShareLine,
  productBaseLabel,
  groupPrompt,
  isCustomizable,
  nextAssembly,
  optionDescription,
  selectionKey,
  isSizeGroup,
  sizePrice,
  soleGroupPick,
  unitPriceCents,
  usesCatalogFlavors,
  variantPriceLabel,
  variantPrompt,
  activeGroups
} from "./assemble.js";
import {
  isOrderFlowState,
  type CartItem,
  type CartSelection,
  type ConversationContext,
  type ConversationState,
  type Crust,
  type Customer,
  type DeliveryNeighborhood,
  type Fulfillment,
  type PaymentMethod,
  type PizzaKind,
  type Product,
  type ProductOptionGroup,
  type SaveConversationOptions,
  type Store,
  type StorePaymentMethod
} from "../types.js";

const CANCEL_KEYS = ["cancelar", "sair"];
/** Durante o lote de pizzas: sai da montagem e recomeça (não encerra o atendimento). */
const BATCH_RESTART_KEYS = [
  "sair",
  "cancelar",
  "desistir",
  "recomecar",
  "comecar de novo",
  "comecar denovo",
  "comecar novamente",
  "voltar ao inicio",
  "comecar outra vez"
];
const BATCH_ABORT_ID = "batch:abort";
const BATCH_ABORT_HINT = "_Errou? Digite *sair* ou toque em *Sair* para começar de novo._";
/** Temporariamente desligada — após o endereço vai direto ao pagamento. */
const ORDER_NOTE_STEP_ENABLED = false;
const ACK_KEYS = [
  "obrigado",
  "obrigada",
  "obrigadao",
  "obg",
  "obgd",
  "brigado",
  "brigada",
  "valeu",
  "vlw",
  "vlww",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "ok",
  "okay",
  "okey",
  "okk",
  "certo",
  "show",
  "top",
  "massa",
  "demais",
  "perfeito",
  "otimo",
  "otima",
  "maravilha",
  "excelente",
  "blz",
  "beleza",
  "blza",
  "tmj",
  "tamo junto",
  "tamos juntos",
  "joia",
  "combinado",
  "fechado",
  "fechou",
  "feito",
  "entendi",
  "entendido",
  "flw",
  "falou",
  "falus",
  "abs",
  "abraco",
  "abraços",
  "abracos",
  "kk",
  "kkk",
  "kkkk",
  "haha",
  "hahaha",
  "rsrs",
  "de nada",
  "por nada",
  "disponha",
  "tranquilo",
  "tranquila",
  "trankilo",
  "suave",
  "de boa",
  "deboa",
  "ta bom",
  "tabom",
  "ta certo",
  "tudo certo",
  "certinho",
  "show de bola",
  "uhum",
  "aham",
  "agradeco",
  "agradecido",
  "agradecida",
  "grato",
  "grata",
  "gratidao",
  "amem"
];

const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;

/** Mensagem só com emoji(s) / espaços / pontuação (ex.: 👍❤️🍕). */
function isEmojiOnlyMessage(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const withoutEmoji = trimmed
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\uFE0F|\u200D/gu, "")
    .replace(/[\s.!?,;:~*_'"«»\-—…]+/gu, "");
  return withoutEmoji.length === 0;
}

function isCustomerAck(rawOrNormalized: string, normalizedMaybe?: string) {
  const raw = normalizedMaybe == null ? rawOrNormalized : rawOrNormalized;
  const normalized = normalizedMaybe == null ? normalize(rawOrNormalized) : normalizedMaybe;

  if (isEmojiOnlyMessage(raw)) return true;

  const text = normalized
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\uFE0F|\u200D/gu, "")
    .replace(/[!?.,;:~*_'"«»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return isEmojiOnlyMessage(raw);

  // Joinha / curtida isolados (já cobertos por emoji-only; mantém fallback).
  if (/^👍+$/u.test(raw.trim()) || /^👍\s/u.test(raw.trim())) return true;

  if (ACK_KEYS.includes(text)) return true;
  if (
    ACK_KEYS.some(
      key => text === key || text.startsWith(`${key} `) || text.endsWith(` ${key}`) || text.includes(` ${key} `)
    )
  ) {
    return true;
  }
  // Variações curtas: okkk, blzzz, vlwww
  if (/^(ok+|blz+|vlw+|obg+|tmj+)$/.test(text)) return true;
  return false;
}

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

function findVariant(incoming: string, normalized: string, groups: ProductOptionGroup[]) {
  if (incoming.startsWith("var:")) {
    const match = groups.find(group => group.id === incoming.slice(4));
    if (match) return match;
  }
  return groups.find(group => {
    const name = normalize(group.name);
    return normalized === name || normalized.startsWith(`${name} `);
  });
}

/** Soft-max do lote: acima disso pedimos confirmação (evita “8 fatias” → 8 pizzas). */
const BATCH_QTY_SOFT_MAX = 4;
const BATCH_QTY_HARD_MAX = 20;

/** “8 fatias”, “oito pedaços” etc. — não é quantidade de pizzas. */
function looksLikeSliceCount(raw: string): boolean {
  const text = normalize(raw.replace(/^qty:/i, ""));
  return /\b(fatias?|peda[cç]os?)\b/.test(text);
}

function parseQuantity(raw: string): number | null {
  const stripped = raw.replace(/^qty:/i, "").trim();
  if (!stripped) return null;

  const digitMatch = stripped.match(/\d{1,3}/);
  if (digitMatch) {
    const quantity = Number(digitMatch[0]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
    return quantity;
  }

  const text = normalize(stripped)
    .replace(/-/g, " ")
    .replace(/\s+e\s+/g, " ")
    .replace(
      /\b(quero|queria|vou querer|pode ser|serao|sera|sao|de|unidades?|itens?|pizzas?|pedacos?|fatias?|vezes)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const UNITS: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezasseis: 16,
    dezessete: 17,
    dezassete: 17,
    dezoito: 18,
    dezenove: 19,
    dezanove: 19
  };
  const TENS: Record<string, number> = {
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50
  };

  if (UNITS[text] != null) return UNITS[text];
  if (TENS[text] != null) return TENS[text];

  const parts = text.split(" ").filter(Boolean);
  if (parts.length === 2 && TENS[parts[0]] != null && UNITS[parts[1]] != null) {
    const quantity = TENS[parts[0]] + UNITS[parts[1]];
    if (quantity >= 1 && quantity <= 50) return quantity;
  }

  // Frases como "quero tres pizzas" → procura token conhecido.
  for (const part of parts) {
    if (UNITS[part] != null) return UNITS[part];
    if (TENS[part] != null) return TENS[part];
  }
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (TENS[parts[i]] != null && UNITS[parts[i + 1]] != null) {
      const quantity = TENS[parts[i]] + UNITS[parts[i + 1]];
      if (quantity >= 1 && quantity <= 50) return quantity;
    }
  }

  return null;
}

function clearBatch(context: ConversationContext) {
  context.batchCategoryId = undefined;
  context.batchProductId = undefined;
  context.batchRemaining = undefined;
  context.batchTotal = undefined;
  context.batchSizeName = undefined;
  context.batchMaxFlavors = undefined;
  context.batchCountPending = undefined;
  context.batchCartStartLength = undefined;
}

/** Etapas do fluxo tamanho → quantas → montagem de cada pizza. */
function isInBatchFlow(state: ConversationState, context: ConversationContext) {
  return state === "awaiting_batch_size" || state === "awaiting_batch_count" || isBatchActive(context);
}

function isBatchRestartCommand(command: string) {
  return BATCH_RESTART_KEYS.includes(command);
}

/** "não", "n", "pronto", "seguir", "não quero", "só isso"... encerram a escolha de adicionais. */
function isAddonsDoneText(text: string) {
  const plain = normalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return false;
  if (/^(n|nao|no|nn|nop|nope)\b/.test(plain)) return true;
  return /^(pronto|seguir|segue|sigo|pode seguir|continuar|continua|pular|pula|nenhum|nenhuma|nada|sem adicional|sem adicionais|sem|so isso|so|somente isso|apenas isso|e so|e isso|finalizar|terminar|ta bom|ta bom assim|ja ta bom|ja esta bom|esta bom|chega|basta)$/.test(
    plain
  );
}

function withBatchAbortHint(text: string, enabled: boolean) {
  if (!enabled) return text;
  return `${text}\n\n${BATCH_ABORT_HINT}`;
}

function appendBatchAbortButton(buttons: { id: string; title: string }[], enabled: boolean) {
  if (!enabled || buttons.length >= 3) return buttons;
  if (buttons.some(button => button.id === BATCH_ABORT_ID)) return buttons;
  return [...buttons, { id: BATCH_ABORT_ID, title: "Sair" }];
}

function batchAbortListRow() {
  return {
    id: BATCH_ABORT_ID,
    title: "Sair / recomeçar",
    description: "Cancelar esta montagem"
  };
}

/** Índice 1-based da pizza em montagem no lote (1..total). */
function batchCurrentPizzaNumber(context: ConversationContext) {
  const total = Math.max(1, context.batchTotal ?? 1);
  const remaining = Math.max(1, context.batchRemaining ?? 1);
  return total - remaining + 1;
}

/** Prefixo ao abrir o menu de sabores no lote (início ou próxima pizza). */
function batchAssembleStartPrefix(context: ConversationContext) {
  const total = context.batchTotal ?? 0;
  if (total <= 1) return undefined;
  const current = batchCurrentPizzaNumber(context);
  return `🍕 Vamos montar a *pizza ${current} de ${total}*:`;
}

function batchMaxFlavors(context: ConversationContext) {
  return Math.max(1, context.batchMaxFlavors ?? 1);
}

/**
 * Total de sabores na montagem = pizza base (1º) + máx. do tamanho no cadastro.
 * Ex.: cadastro maxSelect=2 → Combine até 3 / 1º sabor de 3.
 */
function batchTotalFlavors(context: ConversationContext) {
  return batchMaxFlavors(context) + 1;
}

/** Intro da lista de sabores no lote (após “quantas?”). */
function batchFlavorMenuIntro(context: ConversationContext, prefix?: string) {
  const total = batchTotalFlavors(context);
  const flavorWord = total === 1 ? "sabor" : "sabores";
  const head = prefix !== undefined ? prefix : batchAssembleStartPrefix(context);
  return [head, `🍕 Você pode escolher até *${total}* ${flavorWord}`, `Escolha o *1º* sabor de *${total}*:`]
    .filter(Boolean)
    .join("\n");
}

function isBatchFlavorMenu(context: ConversationContext) {
  return isBatchActive(context) && Boolean(context.batchSizeName?.trim());
}

function productMenuIntro(context: ConversationContext, fallback = "📋 Escolha um item:") {
  return isBatchFlavorMenu(context) ? batchFlavorMenuIntro(context) : fallback;
}

function isBatchActive(context: ConversationContext) {
  return Boolean(context.batchCategoryId) && typeof context.batchRemaining === "number" && context.batchRemaining > 0;
}

function categoryUsesBatch(store: Store, categoryId: string | null | undefined) {
  if (!categoryId) return false;
  return (store.batchCategoryIds ?? []).includes(categoryId);
}

function emptyContext(): ConversationContext {
  return { cart: [] };
}

function ensureDraftSelection(
  product: Product,
  group: ProductOptionGroup,
  drafts: CartSelection[],
  options: CartSelection["options"] = []
): CartSelection {
  const existing = drafts.find(item => item.groupId === group.id);
  if (existing) {
    if (isSizeGroup(group) && !(typeof existing.basePrice === "number" && existing.basePrice > 0)) {
      existing.basePrice = sizePrice(product, group);
    }
    if (!existing.groupName) existing.groupName = group.name;
    return existing;
  }
  const created: CartSelection = {
    groupId: group.id,
    groupName: group.name,
    priceMode: group.priceMode,
    options,
    ...(isSizeGroup(group) ? { basePrice: sizePrice(product, group) } : {})
  };
  drafts.push(created);
  return created;
}

function cartTotal(context: ConversationContext) {
  return context.cart.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}

function itemHeading(
  item: Pick<CartItem, "name" | "catalogName" | "extras" | "quantity" | "unitPriceCents">,
  opts?: { withQuantity?: boolean; withUnitPrice?: boolean }
) {
  // Nome montável: "Pizza F - Família — 1/2 Cangaceiro + 1/2 Calabresa"
  const raw = item.name.trim();
  const sep = " — ";
  const sepAt = raw.indexOf(sep);
  const title = sepAt >= 0 ? raw.slice(0, sepAt).trim() : raw;
  const detail = sepAt >= 0 ? raw.slice(sepAt + sep.length).trim() : "";

  let heading = opts?.withQuantity && item.quantity > 0 ? `${item.quantity}x ${title}` : title;
  if (opts?.withUnitPrice) {
    heading = `${heading} — ${formatBRL(item.unitPriceCents)}`;
  }
  const lines = [`*${heading}*`];
  if (detail) lines.push(detail);
  const crust = crustLabel(item.extras);
  if (crust) lines.push(crust);
  const addons = addonLabel(item.extras);
  if (addons) lines.push(addons);
  return { title, lines };
}

function itemPriceLine(item: CartItem) {
  const unit = formatBRL(item.unitPriceCents);
  if (item.quantity <= 1) return `Unitário ${unit}`;
  const total = formatBRL(item.quantity * item.unitPriceCents);
  return `Unitário ${unit} · ${item.quantity}x = ${total}`;
}

function renderCartItem(item: CartItem) {
  const { lines } = itemHeading(item, { withQuantity: true, withUnitPrice: true });
  lines.push(itemPriceLine(item));
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
    normalized === "pronto" ||
    normalized === "so este sabor" ||
    normalized === "so esse sabor"
  ) {
    return true;
  }
  const last =
    normalized
      .split(/[\n/|]+/)
      .pop()
      ?.trim() ?? "";
  return last === "pular" || last === "pronto";
}

function isSkipNote(incoming: string, normalized: string) {
  return (
    incoming === "skip_note" || normalized === "pular" || normalized === "sem observacao" || normalized === "nenhuma"
  );
}

function isSkipDrinks(incoming: string, normalized: string) {
  const compact = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    incoming === "skip_drinks" ||
    compact === "pular" ||
    compact === "nao" ||
    compact === "nao obrigado" ||
    compact === "nao quero" ||
    compact === "sem bebida" ||
    compact === "sem bebidas" ||
    compact === "continuar"
  );
}

function wantsDrinks(incoming: string, normalized: string) {
  return (
    incoming === "order_drinks" ||
    normalized === "ver bebidas" ||
    normalized === "bebidas" ||
    normalized === "bebida" ||
    normalized === "adicionar bebida" ||
    normalized === "adicionar uma bebida" ||
    normalized === "sim" ||
    normalized === "quero"
  );
}

function clipNote(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function productAddons(product: Product) {
  if (!product.addonsEnabled) return [];
  const linked = (product.addons ?? [])
    .filter(addon => addon.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"));
  if (linked.length) return linked;
  return (await listAddons())
    .filter(addon => addon.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR"));
}

async function productHasAddons(product: Product) {
  return (await productAddons(product)).length > 0;
}

function addonStepDone(drafts?: CartSelection[]) {
  return (drafts ?? []).some(item => item.groupId === ADDON_GROUP_ID);
}

function draftAddon(drafts?: CartSelection[]) {
  return (drafts ?? []).find(item => item.groupId === ADDON_GROUP_ID);
}

function pickedAddonIds(drafts?: CartSelection[]) {
  return new Set(draftAddon(drafts)?.options.map(option => option.id) ?? []);
}

async function remainingAddons(product: Product, drafts?: CartSelection[]) {
  const picked = pickedAddonIds(drafts);
  return (await productAddons(product)).filter(addon => !picked.has(addon.id));
}

function addDraftAddon(drafts: CartSelection[], addon: { id: string; name: string; price: number }) {
  const others = drafts.filter(item => item.groupId !== ADDON_GROUP_ID);
  const current = draftAddon(drafts);
  const options = [...(current?.options ?? [])];
  if (!options.some(option => option.id === addon.id)) {
    options.push({ id: addon.id, name: addon.name, extraPrice: addon.price });
  }
  return [
    ...others,
    {
      groupId: ADDON_GROUP_ID,
      groupName: "Adicional",
      priceMode: "addon" as const,
      options,
      skipped: false
    }
  ];
}

function skipDraftAddon(drafts: CartSelection[]) {
  const current = draftAddon(drafts);
  if (current?.options.length) return drafts;
  const others = drafts.filter(item => item.groupId !== ADDON_GROUP_ID);
  return [
    ...others,
    {
      groupId: ADDON_GROUP_ID,
      groupName: "Adicional",
      priceMode: "addon" as const,
      options: [],
      skipped: true
    }
  ];
}

function crustStepDone(drafts?: CartSelection[]) {
  return (drafts ?? []).some(item => item.groupId === CRUST_GROUP_ID);
}

function setDraftCrust(drafts: CartSelection[], crust: Crust) {
  const others = drafts.filter(item => item.groupId !== CRUST_GROUP_ID);
  return [
    ...others,
    {
      groupId: CRUST_GROUP_ID,
      groupName: "Borda",
      priceMode: "addon" as const,
      options: [
        {
          id: crust.id,
          name: crust.name,
          extraPrice: crust.addsPrice ? crust.price : 0
        }
      ],
      skipped: false
    }
  ];
}

function crustsForPizza(product: Product, crusts: Crust[]) {
  if (!product.pizzaKind) return crusts;
  return crusts.filter(crust => crust.pizzaKind === product.pizzaKind);
}

async function askCrusts(to: string, product: Product, crusts: Crust[], batchAbort = false) {
  const maxRows = batchAbort ? WA_LIST_MAX_ROWS - 1 : WA_LIST_MAX_ROWS;
  const visible = crustsForPizza(product, crusts).slice(0, maxRows);
  if (!visible.length) return false;
  const rows = visible.map(crust => ({
    id: `crust:${crust.id}`,
    title: crust.name.slice(0, 24),
    ...(crust.addsPrice && crust.price > 0 ? { description: `+ ${formatReais(crust.price)}` } : {})
  }));
  if (batchAbort) rows.push(batchAbortListRow());
  await sendList(to, withBatchAbortHint(`*${product.name}*\n🧀 Escolha a borda.`, batchAbort), "Ver bordas", [
    {
      title: "Bordas",
      rows
    }
  ]);
  return true;
}

function commitDraftToCart(context: ConversationContext) {
  const added = context.draftItem;
  if (!added) return null;
  const already = context.cart.find(item => selectionKey(item) === selectionKey(added));
  if (already) already.quantity += added.quantity;
  else context.cart.push(added);
  context.draftItem = undefined;
  context.selectedProductId = undefined;
  context.draftSelections = [];
  context.optionGroupIndex = undefined;
  return added;
}

const CART_ACTIONS = [
  { id: "order", title: "Adicionar mais itens" },
  { id: "checkout", title: "Fechar pedido" },
  { id: "clear_cart", title: "Limpar carrinho" }
] as const;

async function findDrinksCategory() {
  const categories = productCategories(await listProducts());
  return (
    categories.find(item => normalize(item.name) === "bebidas") ??
    categories.find(item => normalize(item.name).includes("bebida")) ??
    null
  );
}

async function isDrinksProduct(productId: string | undefined) {
  if (!productId) return false;
  const drinks = await findDrinksCategory();
  if (!drinks) return false;
  const product = await getProduct(productId);
  return Boolean(product && product.categoryId === drinks.id);
}

async function askDrinksUpsell(to: string, more = false) {
  if (more) {
    await sendButtons(to, "🥤 *Deseja adicionar mais uma bebida?*", [
      { id: "order_drinks", title: "Ver bebidas" },
      { id: "skip_drinks", title: "Pular" }
    ]);
    return;
  }
  await sendButtons(to, "🥤 *Bebidas?*\nQuer adicionar alguma bebida ao pedido?", [
    { id: "order_drinks", title: "Ver bebidas" },
    { id: "skip_drinks", title: "Não, obrigado(a)" }
  ]);
}

/** Após observação (ou item sem obs.): oferece bebidas só quando o lote acabou; no meio do loop segue a próxima pizza. */
async function offerDrinksOrFinish(
  to: string,
  store: Store,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
  addedProductId?: string
) {
  // Ainda faltam pizzas no lote (ex.: 1ª de 2) → não interrompe com Bebidas?
  if (isBatchActive(context) && (context.batchRemaining ?? 0) > 1) {
    await finishItemOrContinueBatch(to, store, context, persist);
    return;
  }
  const drinks = await findDrinksCategory();
  if (!drinks) {
    await finishItemOrContinueBatch(to, store, context, persist);
    return;
  }
  // Acabou de escolher uma bebida → pergunta se quer mais uma.
  if (await isDrinksProduct(addedProductId)) {
    context.drinksOfferMore = true;
    await persist("awaiting_drinks_upsell", context);
    await askDrinksUpsell(to, true);
    return;
  }
  context.drinksOfferMore = false;
  await persist("awaiting_drinks_upsell", context);
  await askDrinksUpsell(to, false);
}

async function openDrinksMenu(
  to: string,
  store: Store,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  const drinks = await findDrinksCategory();
  if (!drinks) {
    await sendText(to, "Não encontrei a categoria de bebidas no cardápio.");
    await finishItemOrContinueBatch(to, store, context, persist);
    return;
  }
  context.menuCategoryId = drinks.id;
  context.menuOffset = 0;
  context.menuLockCategory = true;
  await persist("awaiting_product", context);
  await showMenu(to, `🥤 *${drinks.name}*\nEscolha uma bebida:`, context, persist, store);
}

/** Carrinho + Entrega/Retirada na mesma mensagem (máx. 3 botões no WhatsApp). */
async function showCheckoutOptions(
  to: string,
  store: { deliveryEnabled: boolean; pickupEnabled: boolean },
  context: ConversationContext,
  intro = "✅ Item adicionado!"
) {
  const buttons: { id: string; title: string }[] = [{ id: "order", title: "Adicionar mais itens" }];
  if (store.deliveryEnabled) {
    buttons.push({ id: "fulfillment:delivery", title: "Entrega" });
  }
  if (store.pickupEnabled) {
    buttons.push({ id: "fulfillment:pickup", title: "Retirada" });
  }
  // Sem entrega/retirada configurada: mantém Fechar + Limpar.
  if (buttons.length === 1) {
    buttons.push({ id: "checkout", title: "Fechar pedido" }, { id: "clear_cart", title: "Limpar carrinho" });
  } else if (buttons.length === 2) {
    buttons.push({ id: "clear_cart", title: "Limpar carrinho" });
  }

  await sendButtons(
    to,
    [intro, "", "🛒 *Seu carrinho*", "", renderCart(context), "", "🛵 Como prefere receber?"].join("\n"),
    buttons.slice(0, 3)
  );
}

async function showCartPrompt(to: string, context: ConversationContext, intro = "✅ Item adicionado!") {
  await sendButtons(to, `${intro}\n\n🛒 *Seu carrinho*\n\n${renderCart(context)}`, [...CART_ACTIONS]);
}

async function showCartAfterAdd(
  to: string,
  store: { deliveryEnabled: boolean; pickupEnabled: boolean },
  context: ConversationContext
) {
  await showCheckoutOptions(to, store, context, "✅ Item adicionado!");
}

const RESUME_HINT = "👉 Para continuar, use as opções desta mensagem.";

function isOrderInProgress(state: ConversationState) {
  return isOrderFlowState(state);
}

/**
 * Após devolver o atendimento ao bot: avisa o cliente e reenvia a etapa
 * em que o fluxo parou (com botões/lista quando houver).
 * Fora do horário: só bloqueia se não houver pedido em andamento.
 */
export async function resumeAfterHumanHandoff(input: {
  phone: string;
  customerId: string;
  state: ConversationState;
  context: ConversationContext;
}) {
  const store = await getStore();
  if (!isStoreOpen(store.businessHours, store.timezone) && !isOrderInProgress(input.state)) {
    return;
  }

  const latest = await findLatestOrder(input.customerId);
  const afterDelivered =
    input.state === "welcome" && !(input.context.cart?.length ?? 0) && latest?.status === "delivered";

  if (afterDelivered) {
    const customer = await upsertCustomer(input.phone);
    await saveConversation(customer, "awaiting_new_order", emptyContext(), { reopen: true });
    await askNewOrderAfterHandoff(input.phone);
    return;
  }

  await sendText(input.phone, "Atendimento humano encerrado. Vamos continuar de onde você parou!");
  await resumeCurrentStep(input.phone, store, input.state, input.context, { afterHandoff: true });
}

async function askNewOrderPrompt(to: string, intro?: string) {
  await sendButtons(
    to,
    [intro, intro ? "" : null, "Deseja fazer um *novo pedido*?"]
      .filter((line): line is string => line != null)
      .join("\n"),
    [
      { id: NEW_ORDER_YES, title: "✅ Sim" },
      { id: NEW_ORDER_NO, title: "❌ Não" }
    ]
  );
}

async function askNewOrderAfterHandoff(to: string) {
  await askNewOrderPrompt(to, "Atendimento humano encerrado. Seu último pedido já está *entregue*.");
}

async function declineNewOrder(to: string, timezone: string) {
  await sendText(
    to,
    ["😊 Agradecemos pela preferência!", "Esperamos você novamente. 🍕", dayPeriodWish(timezone)].join("\n")
  );
}

/** Reenvia a última etapa do pedido (botões/lista), sem avançar o fluxo. */
async function resumeCurrentStep(
  to: string,
  store: Store,
  state: ConversationState,
  context: ConversationContext,
  opts?: { afterHandoff?: boolean }
) {
  const hint = opts?.afterHandoff ? "" : RESUME_HINT;
  const withHint = (text: string) => (hint ? `${hint}\n${text}` : text);
  const sendHintIfNeeded = async () => {
    if (hint) await sendText(to, hint);
  };

  switch (state) {
    case "awaiting_product":
      await showMenu(to, withHint(productMenuIntro(context, "Escolha um item do cardápio:")), context);
      return;
    case "awaiting_option": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      if (!product || !isCustomizable(product)) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      const drafts = context.draftSelections ?? [];
      const openGroup = await groupWantingMore(product, drafts);
      if (openGroup) {
        const current = drafts.find(item => item.groupId === openGroup.id);
        if (current?.options.length) {
          if (usesCatalogFlavors(openGroup)) {
            await sendHintIfNeeded();
            await askGroupOptions(to, product, openGroup, drafts, isBatchActive(context));
            return;
          }
          const shares =
            flavorShareLine(
              product.name,
              current.options.map(item => item.name)
            ) || current.options.map(item => item.name).join(" + ");
          const label = `*${openGroup.name}:*\n${shares}`;
          await sendButtons(
            to,
            withBatchAbortHint(withHint(label), isBatchActive(context)),
            appendBatchAbortButton(
              [
                { id: "more_options", title: "Mais um" },
                { id: "done_options", title: "Pronto" }
              ],
              isBatchActive(context)
            )
          );
          return;
        }
      }
      await sendHintIfNeeded();
      await askAssembly(to, product, context);
      return;
    }
    case "awaiting_crust": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      const crusts = await listCrusts();
      if (!product) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      const matching = crustsForPizza(product, crusts);
      if (!matching.length) {
        await askQuantity(to, product, context.draftSelections ?? [], isBatchActive(context));
        return;
      }
      await sendHintIfNeeded();
      await askCrusts(to, product, matching, isBatchActive(context));
      return;
    }
    case "awaiting_addon": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      if (!product) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      await sendHintIfNeeded();
      await askAddons(to, product, context.draftSelections, context.addonOffset ?? 0, false, isBatchActive(context));
      return;
    }
    case "awaiting_quantity": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      if (!product) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      await askQuantity(to, product, context.draftSelections ?? [], isBatchActive(context));
      return;
    }
    case "awaiting_batch_size": {
      const categoryId = context.menuCategoryId ?? context.batchCategoryId;
      const categories = productCategories(await listProducts());
      const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";
      const sizes = categoryId ? await sizesForCategory(categoryId) : [];
      if (!sizes.length) {
        await askBatchCount(to, categoryName);
        return;
      }
      await askBatchSize(to, categoryName, sizes);
      return;
    }
    case "awaiting_batch_count": {
      const categoryId = context.menuCategoryId ?? context.batchCategoryId;
      const categories = productCategories(await listProducts());
      const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";
      if (context.batchCountPending != null && context.batchCountPending > 0) {
        await askBatchCountConfirm(to, context.batchCountPending);
        return;
      }
      await askBatchCount(to, categoryName);
      return;
    }
    case "awaiting_item_note":
      if (context.draftItem) {
        await askItemNote(to, context.draftItem);
        return;
      }
      await showCartPrompt(to, context, hint || "🛒 *Seu carrinho*");
      return;
    case "awaiting_drinks_upsell":
      await askDrinksUpsell(to, Boolean(context.drinksOfferMore));
      return;
    case "cart":
      if (isV2(store)) {
        await showAiCartOptions(to, store, context, hint || "✅ Continue seu pedido");
        return;
      }
      await showCheckoutOptions(to, store, context, hint || "✅ Continue seu pedido");
      return;
    case "awaiting_order_note":
      // if (ORDER_NOTE_STEP_ENABLED) {
      //   await sendHintIfNeeded();
      //   await askOrderNote(to);
      //   return;
      // }
      await askPayment(to, withHint("Como deseja pagar?"));
      return;
    case "awaiting_fulfillment":
      if (isV2(store)) {
        await showAiCartOptions(to, store, context, hint || "✅ Continue seu pedido");
        return;
      }
      // intro já inclui o título do carrinho em showCheckoutOptions — não duplicar.
      await showCheckoutOptions(to, store, context, hint || "✅ Continue seu pedido");
      return;
    case "awaiting_ai_order":
      await askAiOrder(to, opts?.afterHandoff ? undefined : "✍️ Para continuar, *digite seu pedido* aqui.");
      return;
    case "awaiting_fee_confirm":
      await askFeeConfirm(to, store, context);
      return;
    case "awaiting_ai_note":
      await sendHintIfNeeded();
      await askAiOrderNote(to);
      return;
    case "awaiting_ai_drink":
      await sendHintIfNeeded();
      await askAiDrink(to);
      return;
    case "awaiting_ai_change":
      await sendText(to, `${AI_CHANGE_PROMPT}\nSe preferir manter como está, digite *seguir*.`);
      return;
    case "awaiting_ai_addon": {
      const phase = context.aiExtraPhase ?? "addon_ask";
      if (phase === "addon_ask" || phase === "addon_more") {
        await sendHintIfNeeded();
        await askAiAddonQuestion(to, context, phase === "addon_more");
        return;
      }
      if (phase === "addon_pick") {
        await sendHintIfNeeded();
        await askAiAddonItemPick(to, context);
        return;
      }
      const item = context.cart[context.aiStepIndex ?? 0];
      const product = item ? await getProduct(item.productId) : null;
      if (!item || !product) {
        await showAiCartOptions(to, store, context, hint || "✅ Continue seu pedido");
        return;
      }
      await askAddons(to, { ...product, name: item.name }, item.extras, context.addonOffset ?? 0, true);
      return;
    }
    case "awaiting_neighborhood":
    case "awaiting_address":
      if (context.addressDraft) {
        await sendText(
          to,
          `📝 Endereço anotado: *${context.addressDraft}*\nMe diga só o *nome do bairro* (ex.: *Centro*).`
        );
        return;
      }
      await sendHintIfNeeded();
      await askCompleteAddress(to, { pickupEnabled: store.pickupEnabled });
      return;
    case "awaiting_saved_address":
      await sendHintIfNeeded();
      if (context.addressText) await askSavedAddress(to, store, context);
      else await askCompleteAddress(to, { pickupEnabled: store.pickupEnabled });
      return;
    case "awaiting_payment":
      await askPayment(to, withHint("Como deseja pagar?"));
      return;
    case "awaiting_change":
      await askChange(to, orderTotalCents(store, context));
      return;
    case "awaiting_contact_name":
      await sendHintIfNeeded();
      await askContactName(to);
      return;
    case "awaiting_order_code":
      await sendText(to, "Me envie o código do pedido (ex.: A7K2).");
      return;
    case "awaiting_new_order":
      await askNewOrderAfterHandoff(to);
      return;
    default:
      if (isV2(store)) {
        await showWelcomeV2(to, store);
        return;
      }
      await showWelcome(to, store.name);
  }
}

/**
 * Foto, áudio, figurinha, documento etc.: em pedido ativo, mantém a etapa;
 * fora do fluxo (ex.: após despedida), ignora em silêncio.
 */
export async function handleUnsupportedInbound(input: {
  from: string;
  name?: string;
  avatarUrl?: string;
  waMessageId?: string;
}) {
  const store = await getStore();
  const customer = await upsertCustomer(input.from, input.name, input.avatarUrl);
  const existing = await getConversation(customer.id);
  if (existing?.handoffMode === "human") {
    await touchConversation(customer.id);
    return;
  }
  const state: ConversationState = existing?.state ?? "welcome";
  const context = existing?.context ?? emptyContext();

  // Loja fechada: mídia fora de pedido ativo só recebe aviso de horário
  // (pedido feito e ainda não entregue segue o fluxo normal).
  if (
    !isStoreOpen(store.businessHours, store.timezone) &&
    !isOrderInProgress(state) &&
    !isOpenOrderStatus((await findLatestOrder(customer.id))?.status ?? "delivered")
  ) {
    if (input.waMessageId) {
      await sendTypingIndicator(input.waMessageId).catch(() => undefined);
    }
    await sendText(input.from, closedStoreMessage(store.name, store.businessHours));
    return;
  }
  if (input.waMessageId) {
    await sendTypingIndicator(input.waMessageId).catch(() => undefined);
  }

  // Fora do pedido: figurinha/áudio/mídia não reinicia atendimento.
  if (!isOrderInProgress(state) && state !== "awaiting_order_code") {
    await touchConversation(customer.id);
    return;
  }

  await resumeCurrentStep(input.from, store, state, context);
}

async function askItemNote(to: string, item: CartItem) {
  const { lines } = itemHeading(item, { withQuantity: true });
  await sendButtons(
    to,
    ["📝 Observação deste item?", ...lines, "*Digite* por ex.: sem cebola. Ou pode *Pular*."]
      .filter(Boolean)
      .join("\n"),
    [{ id: "skip_note", title: "Pular" }]
  );
}

/** v2: itens do carrinho da IA que aceitam adicionais. */
async function aiAddonItems(context: ConversationContext) {
  const found: { index: number; item: CartItem; product: Product }[] = [];
  for (const [index, item] of context.cart.entries()) {
    const product = await getProduct(item.productId);
    if (product && (await productHasAddons(product))) found.push({ index, item, product });
  }
  return found;
}

/** v2: pergunta única de adicionais (ou "em outro item?" depois de escolher um). */
async function askAiAddonQuestion(to: string, context: ConversationContext, more = false) {
  const eligible = await aiAddonItems(context);
  const body = more
    ? "🧀 Quer colocar adicional em *outro item*?"
    : eligible.length === 1
      ? `🧀 Deseja colocar algum *adicional* na *${eligible[0].item.name}*?`
      : "🧀 Deseja colocar algum *adicional* no pedido?";
  await sendButtons(to, body, [
    { id: "choose_addon", title: "Sim" },
    { id: "skip_addon", title: "Não" }
  ]);
}

async function askAiAddonItemPick(to: string, context: ConversationContext) {
  const eligible = await aiAddonItems(context);
  await sendList(to, "Em qual item você quer o adicional?", "Itens", [
    {
      title: "Itens do pedido",
      rows: [
        ...eligible.slice(0, 9).map(({ index, item }) => ({
          id: `aiitem:${index}`,
          title: `${index + 1}. ${item.name}`,
          description: `${item.quantity}x ${item.name}`
        })),
        { id: "skip_addon", title: "Nenhum", description: "Seguir sem adicional" }
      ]
    }
  ]);
}

/** v2: produtos ativos da categoria Bebidas (vazio = não pergunta bebida). */
async function activeDrinkCategoryId() {
  const drinks = await findDrinksCategory();
  if (!drinks) return null;
  const products = await listProducts();
  return products.some(item => item.active && item.categoryId === drinks.id) ? drinks.id : null;
}

async function cartHasDrink(context: ConversationContext, drinksCategoryId: string) {
  for (const item of context.cart) {
    const product = await getProduct(item.productId);
    if (product?.categoryId === drinksCategoryId) return true;
  }
  return false;
}

async function askAiDrink(to: string) {
  await sendButtons(
    to,
    "🥤 *Deseja uma bebida?*\n*Digite* qual (ex.: *Coca-Cola 2L* ou *2 Guaraná lata*).\nSe não quiser, toque em *Não*.",
    [{ id: "skip_drinks", title: "Não" }]
  );
}

/** v2: observação única para o pedido inteiro. */
async function askAiOrderNote(to: string) {
  await sendButtons(
    to,
    "📝 Alguma *observação* para o pedido?\n*Digite* por ex.: calabresa sem cebola e enviar o molho. Ou toque em *Pular*.",
    [{ id: "skip_note", title: "Pular" }]
  );
}

async function askOrderNote(to: string) {
  await sendButtons(to, "📝 Observação para *entrega*?\nEx.: interfone 12.\nSe não quiser, toque em *Pular*.", [
    { id: "skip_note", title: "Pular" }
  ]);
}

async function askCompleteAddress(to: string, opts?: { pickupEnabled?: boolean }) {
  const intro = [
    "🏠 Digite o *endereço completo* da entrega (não envie localização do celular).",
    "Informe *rua, número, bairro* e uma *referência*.",
    "Ex.: *Rua das Flores, 123 - Vila Nova - próximo ao mercado*",
    "Com o bairro no endereço calculamos a taxa de entrega.",
    opts?.pickupEnabled ? "Caso queira, pode mudar para *retirada*." : null
  ]
    .filter(Boolean)
    .join("\n");

  if (opts?.pickupEnabled) {
    await sendButtons(to, intro, [{ id: "switch_pickup", title: "Quero retirar" }]);
    return;
  }
  await sendText(to, intro);
}

async function askNeighborhoodAmbiguous(to: string, matches: { zone: DeliveryNeighborhood; score: number }[]) {
  const rows = matches.slice(0, WA_LIST_MAX_ROWS).map(item => ({
    id: `nbh:${item.zone.id}`,
    title: item.zone.name.slice(0, 24),
    description: formatBRL(item.zone.feeCents)
  }));
  await sendList(to, "📍 Encontrei mais de um bairro parecido. Qual é o certo?", "Ver bairros", [
    { title: "Bairros", rows }
  ]);
}

function wantsSwitchToPickup(incoming: string, normalized: string) {
  return (
    incoming === "switch_pickup" ||
    incoming === "fulfillment:pickup" ||
    normalized === "quero retirar" ||
    normalized === "retirar" ||
    normalized === "retirada" ||
    normalized === "quero retirada" ||
    normalized === "mudar para retirada"
  );
}

/** Texto parece um endereço novo (rua/avenida ou vários termos com número), não só o bairro. */
function looksLikeFullAddress(text: string) {
  const plain = normalize(text);
  if (/^(rua|r|av|avenida|travessa|tv|alameda|al|rodovia|rod|estrada|est|praca|pca)\b/.test(plain)) return true;
  return /\d/.test(plain) && plain.split(" ").length >= 4;
}

function resolveTypedAddress(input: { text: string }): string | null {
  const text = input.text.trim();
  return text || null;
}

async function askPayment(to: string, intro = "💳 Como deseja pagar?") {
  const methods = await listPaymentMethods();
  if (!methods.length) {
    await sendText(
      to,
      "Nenhuma forma de pagamento cadastrada. Avise a loja para configurar em Adicionais → Pagamentos."
    );
    return;
  }
  const rows = methods.slice(0, WA_LIST_MAX_ROWS).map(method => ({
    id: `pay:${method.id}`,
    title: method.name.slice(0, 24)
  }));
  await sendList(to, intro, "Ver opções", [{ title: "Pagamento", rows }]);
}

async function askContactName(to: string) {
  await sendText(to, "Informe seu nome para contato:");
}

function clipContactName(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

function paymentKindAliases(kind: StorePaymentMethod["kind"]): string[] {
  if (kind === "pix") return ["pix"];
  if (kind === "cash") return ["cash", "dinheiro"];
  if (kind === "credit") {
    return ["credit", "credito", "cartao credito", "cartao de credito"];
  }
  if (kind === "debit") {
    return ["debit", "debito", "cartao debito", "cartao de debito"];
  }
  return [];
}

async function resolvePaymentMethod(
  incoming: string,
  normalized: string
): Promise<StorePaymentMethod | "card_ambiguous" | null> {
  const methods = await listPaymentMethods();
  if (!methods.length) return null;

  if (incoming.startsWith("pay:")) {
    const id = incoming.slice(4);
    const byId = methods.find(item => item.id === id);
    if (byId) return byId;
  }

  const byName = methods.find(item => normalize(item.name) === normalized);
  if (byName) return byName;

  for (const method of methods) {
    const aliases = paymentKindAliases(method.kind);
    if (aliases.includes(normalized)) return method;
  }

  if (normalized === "card" || normalized === "cartao") {
    const cardMethods = methods.filter(item => item.kind === "credit" || item.kind === "debit");
    if (cardMethods.length === 1) return cardMethods[0];
    if (cardMethods.length > 1) return "card_ambiguous";
  }

  return null;
}

/** Aceita "no pix", "vou pagar no cartão de crédito", "pix por favor" etc. */
async function resolvePaymentMethodLoose(raw: string): Promise<StorePaymentMethod | null> {
  const base = normalize(raw)
    .replace(/[!?.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = base
    .replace(
      /\b(vou|vai|quero|pagar|pagamento|pago|pode ser|sera|no|na|em|pelo|pela|via|com|de|por favor|pfv|pf|moco|moca)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  for (const candidate of [base, stripped]) {
    if (!candidate) continue;
    const method = await resolvePaymentMethod(candidate, candidate);
    if (method && method !== "card_ambiguous") return method;
  }
  return null;
}

async function menuPlainText() {
  const products = (await listProducts()).filter(item => item.active);
  const byCategory = new Map<string, string[]>();
  for (const product of products) {
    const list = byCategory.get(product.categoryName) ?? [];
    list.push(product.price > 0 ? `• ${product.name} — ${formatReais(product.price)}` : `• ${product.name}`);
    byCategory.set(product.categoryName, list);
  }
  const text = [...byCategory.entries()].map(([name, lines]) => `*${name}*\n${lines.join("\n")}`).join("\n\n");
  return `📋 *Cardápio*\n\n${text}`.slice(0, 3900);
}

function paymentDisplayLabel(method: PaymentMethod, label?: string | null) {
  const custom = label?.trim();
  if (custom) return custom;
  if (method === "pix") return "Pix na Entrega/Retirada";
  if (method === "cash") return "Dinheiro";
  if (method === "credit") return "Cartão crédito";
  if (method === "debit") return "Cartão débito";
  if (method === "other") return "Outro";
  return "Cartão";
}

function parseChangeCents(text: string): number | null {
  const normalized = normalize(text)
    .replace(/[!?.,]+$/g, "")
    .trim();
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
    `💵 Troco para quanto?\nO total é *${formatBRL(totalCents)}*.\nSe não precisar, envie *sem troco*.`
  );
}

function orderTotalCents(store: Store, context: ConversationContext) {
  const deliveryFee =
    context.fulfillment === "delivery"
      ? resolveDeliveryFee(store, {
          neighborhoodId: context.neighborhoodId,
          address: context.addressText
        }).cents
      : 0;
  return cartTotal(context) + deliveryFee;
}

async function showWelcome(to: string, storeName: string) {
  await sendButtons(
    to,
    [
      `Olá! 👋 Bem-vindo à *${storeName}*.`,
      "Posso te ajudar com o cardápio. 🍕",
      "Caso queira encerrar a conversa sem finalizar o pedido, digite *Sair*."
    ].join("\n"),
    [{ id: "menu", title: "Ver cardápio" }]
  );
}

function isV2(store: Pick<Store, "botFlowVersion">) {
  return store.botFlowVersion === "v2";
}

const AI_ORDER_EXAMPLE = "Ex.: *uma família meia calabresa e meia frango com catupiry borda de cheddar e uma coca 1L*";

function aiOrderPrompt(intro = "✍️ *Digite seu pedido* em *uma mensagem*.") {
  return [intro, AI_ORDER_EXAMPLE, "Para encerrar sem pedir, digite *Sair*."].join("\n");
}

/** v2: saudação + cardápio + convite para digitar o pedido numa única mensagem (cada envio é cobrado pela Meta). */
async function showWelcomeV2(to: string, store: Store, opts?: { greetOnly?: boolean }) {
  const greeting = `Olá! 👋 Sou a assistente virtual da *${store.name}* e vou te ajudar a montar seu pedido.`;
  const withMenu = store.menuImageUrl ? `${greeting}\n📋 Esse é o nosso cardápio.` : greeting;
  const body = opts?.greetOnly ? withMenu : `${withMenu}\n\n${aiOrderPrompt()}`;
  if (store.menuImageUrl) {
    try {
      await sendImage(to, store.menuImageUrl, body);
      return;
    } catch (error) {
      console.warn("[v2] falha ao enviar imagem do cardápio:", error instanceof Error ? error.message : error);
    }
  }
  await sendText(to, opts?.greetOnly ? greeting : `${greeting}\n\n${aiOrderPrompt()}`);
}

async function askAiOrder(to: string, intro?: string) {
  await sendText(to, aiOrderPrompt(intro));
}

/** v2: carrinho montado pela IA + Entrega / Retirada / Corrigir pedido. */
async function showAiCartOptions(
  to: string,
  store: Pick<Store, "deliveryEnabled" | "pickupEnabled">,
  context: ConversationContext,
  intro = "✅ Entendi seu pedido!"
) {
  const buttons: { id: string; title: string }[] = [];
  if (store.deliveryEnabled) buttons.push({ id: "fulfillment:delivery", title: "Entrega" });
  if (store.pickupEnabled) buttons.push({ id: "fulfillment:pickup", title: "Retirada" });
  if (!buttons.length) buttons.push({ id: "checkout", title: "Fechar pedido" });
  buttons.push({ id: "ai_fix", title: "Corrigir pedido" });
  await sendButtons(
    to,
    [intro, "", "🛒 *Seu carrinho*", "", renderCart(context), "", "🛵 Como prefere receber?"].join("\n"),
    buttons.slice(0, 3)
  );
}

async function askFeeConfirm(to: string, store: Store, context: ConversationContext) {
  const fee = resolveDeliveryFee(store, {
    neighborhoodId: context.neighborhoodId,
    address: context.addressText
  });
  const place = fee.neighborhood?.name ?? context.neighborhoodName;
  const payment = context.aiHints?.payment;
  const body = [
    context.addressText ? `🏠 ${context.addressText}` : null,
    place
      ? `📍 Bairro *${place}* · taxa de entrega *${formatBRL(fee.cents)}*.`
      : `🛵 Taxa de entrega: *${formatBRL(fee.cents)}*.`,
    `💰 Total com entrega: *${formatBRL(orderTotalCents(store, context))}*`,
    payment ? `💳 Pagamento: *${payment}*` : null,
    "Podemos seguir?"
  ]
    .filter(Boolean)
    .join("\n");
  const buttons = [{ id: "fee_accept", title: "Sim" }];
  if (store.pickupEnabled) buttons.push({ id: "switch_pickup", title: "Quero retirar" });
  await sendButtons(to, body, buttons);
}

const SAVED_ADDRESS_YES = "saved_address:yes";
const SAVED_ADDRESS_NO = "saved_address:no";

/** Endereço do último pedido de entrega: confirma com Sim / Outro endereço (já com taxa e total). */
async function askSavedAddress(to: string, store: Store, context: ConversationContext) {
  const fee = resolveDeliveryFee(store, {
    neighborhoodId: context.neighborhoodId,
    address: context.addressText
  });
  const place = fee.neighborhood?.name ?? context.neighborhoodName;
  const total = formatBRL(orderTotalCents(store, context));
  const body = [
    "📍 Entregar no mesmo endereço do último pedido?",
    `*${context.addressText}*`,
    place
      ? `Bairro ${place} · taxa ${formatBRL(fee.cents)} · total *${total}*`
      : `Taxa ${formatBRL(fee.cents)} · total *${total}*`
  ].join("\n");
  await sendButtons(to, body, [
    { id: SAVED_ADDRESS_YES, title: "Sim" },
    { id: SAVED_ADDRESS_NO, title: "Outro endereço" }
  ]);
}

const SAVED_ADDRESS_YES_WORDS =
  /^(s|sim|ss|isso|isso mesmo|esse|esse mesmo|este|mesmo|o mesmo|mesmo endereco|pode|pode ser|pode sim|confirmo|correto|certo|ok|okay|beleza|blz|yes)$/;
const SAVED_ADDRESS_NO_WORDS =
  /^(n|nao|no|outro|outro endereco|outra|mudou|mudei|endereco novo|novo endereco|nao e esse|nao e mais esse)$/;

function isFeeAccept(incoming: string, normalized: string) {
  return (
    incoming === "fee_accept" ||
    ["aceitar", "aceito", "sim", "ok", "pode", "pode seguir", "seguir", "confirmar", "confirmo"].includes(normalized)
  );
}

function isAiFix(incoming: string, normalized: string) {
  return (
    incoming === "ai_fix" || ["corrigir", "corrigir pedido", "alterar pedido", "mudar pedido"].includes(normalized)
  );
}

const GREETING_ONLY =
  /^(oi+|ola|opa|eai|e ai|hello|hi|bom dia|boa tarde|boa noite|oi bom dia|oi boa tarde|oi boa noite|ola bom dia|ola boa tarde|ola boa noite|tudo bem|oi tudo bem)[\s!?.,]*$/;

/** Cliente com pedido em andamento pedindo outro ("quero outra pizza", "outro pedido", "quero pedir"...). */
function wantsAnotherOrder(text: string) {
  const plain = normalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return false;
  return [
    /\b(outr[oa]s?|nov[oa]s?)\s+(pedido|pedidos|pizza|pizzas|lanche|compra)\b/,
    /\bmais\s+(uma?\s+)?(pizza|pizzas|pedido|refri|refrigerante|coca|bebida|suco)\b/,
    /\b(fazer|faco|faz|fazendo)\s+(outro|outra|mais um|mais uma|novo|nova)\b/,
    /\b(pedir|pedido)\s+(de novo|novamente|outra vez|mais)\b/,
    /\b(quero|queria|gostaria de|vou|posso)\s+pedir\b/,
    /\besqueci\s+de\s+pedir\b/
  ].some(pattern => pattern.test(plain));
}

const WA_LIST_MAX_ROWS = 10;

function resetMenuBrowse(context: ConversationContext) {
  context.menuCategoryId = null;
  context.menuOffset = 0;
  context.menuLockCategory = undefined;
  context.drinksOfferMore = undefined;
}

function canGoBackToCategories(context: ConversationContext, categoryCount: number) {
  return categoryCount > 1 && Boolean(context.menuCategoryId) && !context.menuLockCategory;
}

function productCategories(products: Product[]) {
  const map = new Map<string, { id: string; name: string; count: number; sortOrder: number }>();
  for (const product of products) {
    const id = product.categoryId || product.categoryName || "cardapio";
    const name = product.categoryName?.trim() || "Cardápio";
    const current = map.get(id);
    if (current) current.count += 1;
    else map.set(id, { id, name, count: 1, sortOrder: product.categorySortOrder ?? 0 });
  }
  return [...map.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR")
  );
}

async function showMenuCategories(
  to: string,
  categories: { id: string; name: string; count: number }[],
  offset: number
) {
  const reserveMore = offset + (WA_LIST_MAX_ROWS - 1) < categories.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - reserveMore;
  const page = categories.slice(offset, offset + pageSize);
  const rows: { id: string; title: string; description?: string }[] = page.map(category => ({
    id: `menucat:${category.id}`,
    title: category.name.slice(0, 24)
  }));
  if (reserveMore) {
    rows.push({
      id: "menu:more_cats",
      title: "Mais categorias",
      description: "Ver próximas"
    });
  }
  await sendList(to, "📂 Escolha uma *categoria*.", "Categorias", [{ title: "Categorias", rows }]);
}

function menuItemsPageSize(total: number, offset: number, canGoBack: boolean, reserveAbort = false) {
  const reserveBack = canGoBack ? 1 : 0;
  const reservePrev = offset > 0 ? 1 : 0;
  const reserveExit = reserveAbort ? 1 : 0;
  const navReserve = reserveBack + reservePrev + reserveExit;
  const tentativeMore = offset + (WA_LIST_MAX_ROWS - navReserve - 1) < total ? 1 : 0;
  return Math.max(1, WA_LIST_MAX_ROWS - navReserve - tentativeMore);
}

/** Offset da página anterior de itens (mesmo critério de paginação do Mais itens). */
function previousMenuItemsOffset(total: number, offset: number, canGoBack: boolean, reserveAbort = false) {
  if (offset <= 0) return 0;
  let cursor = 0;
  let previous = 0;
  while (cursor < offset) {
    previous = cursor;
    cursor += menuItemsPageSize(total, cursor, canGoBack, reserveAbort);
    if (cursor <= previous) break;
  }
  return previous;
}

async function showMenuProducts(
  to: string,
  intro: string,
  products: Product[],
  opts: {
    categoryName?: string | null;
    offset: number;
    canGoBack: boolean;
    listButton?: string;
    batchAbort?: boolean;
  }
) {
  const batchAbort = Boolean(opts.batchAbort);
  const pageSize = menuItemsPageSize(products.length, opts.offset, opts.canGoBack, batchAbort);
  const page = products.slice(opts.offset, opts.offset + pageSize);
  const hasMore = opts.offset + page.length < products.length;

  const rows: { id: string; title: string; description?: string }[] = page.map(product => {
    const detail = product.description?.trim();
    const description = detail ? detail.slice(0, 72) : product.customizable ? undefined : formatReais(product.price);
    return {
      id: `product:${product.id}`,
      title: product.name.slice(0, 24),
      ...(description ? { description } : {})
    };
  });
  if (hasMore) {
    rows.push({
      id: "menu:more_items",
      title: "Mais itens",
      description: "Ver próximos"
    });
  }
  if (opts.offset > 0) {
    rows.push({
      id: "menu:prev_items",
      title: "← Voltar",
      description: "Itens anteriores"
    });
  }
  if (opts.canGoBack) {
    rows.push({
      id: "menu:back_cats",
      title: "← Categorias",
      description: "Voltar"
    });
  }
  if (batchAbort) rows.push(batchAbortListRow());

  const heading = withBatchAbortHint(
    [intro, opts.categoryName ? `📂 *${opts.categoryName}*` : null].filter(Boolean).join("\n"),
    batchAbort
  );

  await sendList(to, heading, opts.listButton?.trim() || "Ver itens", [
    {
      title: opts.categoryName?.slice(0, 24) || "Cardápio",
      rows: rows.slice(0, WA_LIST_MAX_ROWS)
    }
  ]);
}

async function showMenu(
  to: string,
  intro = "📋 Escolha um item do cardápio:",
  context: ConversationContext = { cart: [] },
  persist?: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
  store?: Store
) {
  const products = await listProducts();
  if (!products.length) {
    await sendText(to, "📋 O cardápio ainda não foi cadastrado.");
    return;
  }

  // Até 3 itens: botões de resposta.
  if (products.length <= 3 && !context.menuCategoryId) {
    await sendButtons(
      to,
      intro,
      products.map(product => ({
        id: `product:${product.id}`,
        title: product.name.slice(0, 20)
      }))
    );
    return;
  }

  const categories = productCategories(products);
  const offset = Math.max(0, context.menuOffset ?? 0);
  const resolvedStore = store ?? (await getStore());

  // Uma categoria só: se estiver no lote, pergunta tamanho → quantas antes dos itens.
  if (
    !context.menuCategoryId &&
    categories.length === 1 &&
    persist &&
    !isBatchActive(context) &&
    categoryUsesBatch(resolvedStore, categories[0].id)
  ) {
    context.menuCategoryId = categories[0].id;
    context.menuOffset = 0;
    await startCategoryBatch(to, categories[0].id, categories[0].name, context, persist);
    return;
  }

  // Categoria já escolhida → lista produtos dela.
  if (context.menuCategoryId) {
    const inCategory = products.filter(
      item => (item.categoryId || item.categoryName || "cardapio") === context.menuCategoryId
    );
    const categoryName =
      inCategory[0]?.categoryName ?? categories.find(item => item.id === context.menuCategoryId)?.name ?? "Cardápio";
    const flavorMenu = isBatchFlavorMenu(context);
    const drinksMenu = normalize(categoryName).includes("bebida");
    await showMenuProducts(to, intro, inCategory, {
      categoryName,
      offset,
      canGoBack: canGoBackToCategories(context, categories.length),
      listButton: drinksMenu ? "Escolher bebida" : flavorMenu ? "Escolher sabor" : "Ver itens",
      batchAbort: isBatchActive(context)
    });
    return;
  }

  // Muitos itens e várias categorias → escolhe categoria primeiro.
  if (categories.length > 1 && products.length > WA_LIST_MAX_ROWS) {
    await showMenuCategories(to, categories, offset);
    return;
  }

  // Catálogo curto ou uma categoria só → produtos com "Mais itens" se precisar.
  await showMenuProducts(to, intro, products, {
    categoryName: categories.length === 1 ? categories[0].name : null,
    offset,
    canGoBack: false
  });
}

function findProductByText(products: Product[], normalized: string) {
  if (!normalized) return null;
  const exact = products.find(item => normalize(item.name) === normalized);
  if (exact) return exact;
  if (normalized.length < 3) return null;
  const matches = products.filter(item => normalize(item.name).includes(normalized));
  return matches.length === 1 ? matches[0] : null;
}

async function askAssembly(to: string, product: Product, context: ConversationContext) {
  const next = nextAssembly(product, context.draftSelections ?? []);
  if (next.type === "done") return true;

  if (next.type === "variant") {
    await sendList(to, variantPrompt(product), "Tamanhos", [
      {
        title: "Tamanhos",
        rows: next.groups.slice(0, 10).map(group => ({
          id: `var:${group.id}`,
          title: group.name.slice(0, 24),
          description: variantPriceLabel(product, group)
        }))
      }
    ]);
    return false;
  }

  const group = next.group;
  return askGroupOptions(to, product, group, context.draftSelections ?? [], isBatchActive(context));
}

async function pizzaFlavorChoices(kind: PizzaKind | null | undefined, excludeIds: string[] = []) {
  const blocked = new Set(excludeIds);
  return (await listProducts()).filter(item => {
    if (!item.customizable || !item.active || blocked.has(item.id)) return false;
    if (!kind) return true;
    return item.pizzaKind === kind;
  });
}

async function showFlavorList(
  to: string,
  product: Product,
  group: ProductOptionGroup,
  drafts: CartSelection[],
  offset = 0,
  batchAbort = false
) {
  const current = drafts.find(item => item.groupId === group.id);
  const picked = current?.options.map(option => option.id) ?? [];
  const pickedNames = current?.options.map(option => option.name) ?? [];
  const remaining = await pizzaFlavorChoices(product.pizzaKind, [product.id, ...picked]);
  if (!remaining.length) return true;

  const needsDone = picked.length >= 1;
  const reserveDone = needsDone ? 1 : 0;
  const reserveAbort = batchAbort ? 1 : 0;
  const tentativeMore = offset + (WA_LIST_MAX_ROWS - reserveDone - reserveAbort - 1) < remaining.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - reserveDone - reserveAbort - tentativeMore;
  const page = remaining.slice(offset, offset + pageSize);
  const hasMore = offset + page.length < remaining.length;

  const rows: { id: string; title: string; description?: string }[] = page.map(pizza => {
    const detail = pizza.description?.trim();
    const description = detail && detail.toLowerCase() !== "null" ? detail.slice(0, 72) : undefined;
    return {
      id: `flavor:${pizza.id}`,
      title: pizza.name.slice(0, 24),
      ...(description ? { description } : {})
    };
  });
  if (hasMore) {
    rows.push({
      id: "more_flavors",
      title: "Mais sabores",
      description: "Ver próximos"
    });
  }
  if (needsDone) {
    rows.push({
      id: "done_options",
      title: "Pronto",
      description: "Seguir com estes sabores"
    });
  }
  if (batchAbort) rows.push(batchAbortListRow());

  await sendList(
    to,
    withBatchAbortHint(groupPrompt(product, group, picked, pickedNames), batchAbort),
    "Escolha o sabor",
    [
      {
        title: "Sabores",
        rows: rows.slice(0, WA_LIST_MAX_ROWS)
      }
    ]
  );
  return false;
}

async function askGroupOptions(
  to: string,
  product: Product,
  group: ProductOptionGroup,
  drafts: CartSelection[],
  batchAbort = false
) {
  const current = drafts.find(item => item.groupId === group.id);
  const picked = current?.options.map(option => option.id) ?? [];
  const pickedNames = current?.options.map(option => option.name) ?? [];

  if (usesCatalogFlavors(group)) {
    // Não lista a própria pizza do cardápio nem sabores já marcados nesta montagem.
    const remaining = await pizzaFlavorChoices(product.pizzaKind, [product.id, ...picked]);
    if (!remaining.length) return true;

    // A partir do 2º sabor extra: botões Escolher sabor + Pronto (Pronto também fica na lista).
    if (picked.length >= 2) {
      await sendButtons(
        to,
        withBatchAbortHint(groupPrompt(product, group, picked, pickedNames), batchAbort),
        appendBatchAbortButton(
          [
            { id: "choose_flavor", title: "Escolher sabor" },
            { id: "done_options", title: "Pronto" }
          ],
          batchAbort
        )
      );
      return false;
    }

    // Já escolheu 1 sabor extra: Escolher sabor + Só este sabor.
    if (picked.length > 0) {
      await sendButtons(
        to,
        withBatchAbortHint(groupPrompt(product, group, picked, pickedNames), batchAbort),
        appendBatchAbortButton(
          [
            { id: "choose_flavor", title: "Escolher sabor" },
            { id: "skip_group", title: "Só este sabor" }
          ],
          batchAbort
        )
      );
      return false;
    }

    // Primeira decisão (só o sabor do item): Só este sabor + Escolher sabor.
    await sendButtons(
      to,
      withBatchAbortHint(groupPrompt(product, group, picked, pickedNames), batchAbort),
      appendBatchAbortButton(
        [
          { id: "skip_group", title: "Só este sabor" },
          { id: "choose_flavor", title: "Escolher sabor" }
        ],
        batchAbort
      )
    );
    return false;
  }

  const remaining = group.options.filter(option => !picked.includes(option.id));
  if (!remaining.length) return true;

  const pageSize = batchAbort ? WA_LIST_MAX_ROWS - 1 : WA_LIST_MAX_ROWS;
  const rows = remaining.slice(0, pageSize).map(option => ({
    id: `opt:${option.id}`,
    title: option.name.slice(0, 24),
    ...(group.maxSelect > 1 || group.exclusiveSet?.trim() ? {} : { description: optionDescription(option.extraPrice) })
  }));
  if (batchAbort) rows.push(batchAbortListRow());
  await sendList(to, withBatchAbortHint(groupPrompt(product, group, picked, pickedNames), batchAbort), "Escolher", [
    {
      title: group.name.slice(0, 24),
      rows
    }
  ]);
  if (!group.required && picked.length === 0) {
    await sendButtons(
      to,
      withBatchAbortHint("✨ Esta etapa é opcional.", batchAbort),
      appendBatchAbortButton([{ id: "skip_group", title: "Pular" }], batchAbort)
    );
  }
  return false;
}

async function groupWantingMore(product: Product, drafts: CartSelection[]) {
  const groups = activeGroups(product);
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index];
    const group = groups.find(item => item.id === draft.groupId);
    if (!group || draft.skipped || draft.options.length >= group.maxSelect) {
      continue;
    }
    if (usesCatalogFlavors(group)) {
      const remaining = await pizzaFlavorChoices(product.pizzaKind, [
        product.id,
        ...draft.options.map(option => option.id)
      ]);
      if (remaining.length) return group;
      continue;
    }
    const picked = new Set(draft.options.map(option => option.id));
    if (group.options.some(option => !picked.has(option.id))) return group;
  }
  return null;
}

async function askQuantity(to: string, product: Product, extras: CartSelection[], batchAbort = false) {
  const variant = assembledName(product, extras);
  const price = unitPriceCents(product, extras);
  const sep = " — ";
  const sepAt = variant.indexOf(sep);
  const title = sepAt >= 0 ? variant.slice(0, sepAt).trim() : variant;
  const detail = sepAt >= 0 ? variant.slice(sepAt + sep.length).trim() : "";
  const heading = [`*${title}*`, detail || null, crustLabel(extras), addonLabel(extras), formatReais(price / 100)]
    .filter(Boolean)
    .join("\n");
  await sendButtons(
    to,
    withBatchAbortHint(
      batchAbort
        ? `${heading}\n🔢 Quantas unidades?\nUse os botões ou digite um número.`
        : `${heading}\n🔢 Quantas unidades?\nOu digite um número de 1 a 50.`,
      batchAbort
    ),
    batchAbort
      ? appendBatchAbortButton(
          [
            { id: "qty:1", title: "1" },
            { id: "qty:2", title: "2" }
          ],
          true
        )
      : [
          { id: "qty:1", title: "1" },
          { id: "qty:2", title: "2" },
          { id: "qty:3", title: "3" }
        ]
  );
}

async function askBatchCount(to: string, categoryName: string) {
  await sendButtons(
    to,
    withBatchAbortHint(
      `*${categoryName}*\n🔢 Quantas *pizzas* você quer?\nUse os botões (*1* ou *2*) ou digite o número (ex.: *3*).\n_(Não digite fatias — ex.: “8 fatias” não conta.)_`,
      true
    ),
    appendBatchAbortButton(
      [
        { id: "qty:1", title: "1" },
        { id: "qty:2", title: "2" }
      ],
      true
    )
  );
}

async function askBatchCountConfirm(to: string, quantity: number) {
  await sendButtons(
    to,
    withBatchAbortHint(
      `Você digitou *${quantity}*. Confirma que quer *${quantity} pizzas*?\n\nSe era outra coisa (ex.: número de fatias do tamanho), toque em *Corrigir*.`,
      true
    ),
    appendBatchAbortButton(
      [
        { id: `qtyconfirm:${quantity}`, title: `Sim, ${quantity} pizzas`.slice(0, 20) },
        { id: "qtyconfirm:no", title: "Corrigir" }
      ],
      true
    )
  );
}

type BatchSizeOption = {
  id: string;
  name: string;
  price: number;
  sortOrder: number;
  maxSelect: number;
};

/** Tamanhos disponíveis nos itens customizáveis da categoria (união por nome). */
async function sizesForCategory(categoryId: string): Promise<BatchSizeOption[]> {
  const products = (await listProducts()).filter(item => item.categoryId === categoryId && isCustomizable(item));
  const byName = new Map<string, BatchSizeOption>();
  for (const product of products) {
    for (const group of activeGroups(product).filter(item => isSizeGroup(item))) {
      const key = normalize(group.name);
      if (byName.has(key)) continue;
      byName.set(key, {
        id: group.id,
        name: group.name,
        price: group.price > 0 ? group.price : product.price,
        sortOrder: group.sortOrder,
        maxSelect: Math.max(1, group.maxSelect ?? 1)
      });
    }
  }
  // Preferir ordem/preço/máx. sabores/nome do catálogo global quando o nome bater.
  const catalog = await listSizes();
  for (const size of catalog) {
    const key = normalize(size.name);
    const existing = byName.get(key);
    if (existing) {
      existing.name = size.name;
      existing.price = size.price;
      existing.sortOrder = size.sortOrder;
      existing.id = size.id;
      existing.maxSelect = Math.max(1, size.maxSelect ?? existing.maxSelect);
    }
  }
  return [...byName.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR")
  );
}

async function askBatchSize(to: string, categoryName: string, sizes: BatchSizeOption[]) {
  const rows = sizes.slice(0, WA_LIST_MAX_ROWS).map(size => ({
    id: `batchsize:${size.id}`,
    title: size.name.slice(0, 24),
    description: formatReais(size.price)
  }));
  await sendList(to, `*${categoryName}*\n📏 Escolha o tamanho.`, "Tamanhos", [
    {
      title: "Tamanhos",
      rows
    }
  ]);
}

async function startCategoryBatch(
  to: string,
  categoryId: string,
  categoryName: string,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  clearBatch(context);
  context.menuCategoryId = categoryId;
  context.menuOffset = 0;
  const sizes = await sizesForCategory(categoryId);
  if (!sizes.length) {
    await persist("awaiting_batch_count", context);
    await askBatchCount(to, categoryName);
    return;
  }
  await persist("awaiting_batch_size", context);
  await askBatchSize(to, categoryName, sizes);
}

/** Aborta o lote (remove pizzas desta sessão) e recomeça tamanho/quantidade. */
async function abortBatchAndRestart(
  to: string,
  store: Store,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  const categoryId = context.batchCategoryId ?? context.menuCategoryId ?? null;
  const start = context.batchCartStartLength;
  if (typeof start === "number" && start >= 0 && start <= context.cart.length) {
    context.cart = context.cart.slice(0, start);
  }
  context.draftItem = undefined;
  context.draftSelections = [];
  context.selectedProductId = undefined;
  context.optionGroupIndex = undefined;
  context.addonOffset = 0;
  context.flavorOffset = 0;
  context.menuOffset = 0;
  context.menuLockCategory = undefined;
  clearBatch(context);

  await sendText(to, "🔄 Montagem cancelada. Vamos começar de novo — escolha o tamanho e a quantidade.");

  if (categoryId && categoryUsesBatch(store, categoryId)) {
    const categories = productCategories(await listProducts());
    const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";
    await startCategoryBatch(to, categoryId, categoryName, context, persist);
    return;
  }

  context.menuCategoryId = null;
  await persist("awaiting_product", context);
  await showMenu(to, "📋 Escolha um item do cardápio:", context, persist, store);
}

/** Localiza o grupo de tamanho do produto correspondente ao tamanho do lote. */
function findProductSizeGroup(product: Product, sizeName: string) {
  const sizes = activeGroups(product).filter(group => isSizeGroup(group));
  if (!sizes.length) return null;
  const want = normalize(sizeName);
  if (!want) return null;
  return (
    sizes.find(group => normalize(group.name) === want) ??
    sizes.find(group => {
      const name = normalize(group.name);
      return name.startsWith(want) || want.startsWith(name) || name.includes(want) || want.includes(name);
    }) ??
    null
  );
}

/** Aplica o tamanho do lote no rascunho do produto (pula a etapa de tamanho). */
function applyBatchSizeToProduct(product: Product, context: ConversationContext) {
  const sizeName = context.batchSizeName?.trim();
  if (!sizeName || !isCustomizable(product)) return false;
  const match = findProductSizeGroup(product, sizeName);
  if (!match) return false;

  const drafts = [...(context.draftSelections ?? [])];
  const exclusive = match.exclusiveSet?.trim();
  const next = exclusive
    ? drafts.filter(item => {
        const group = activeGroups(product).find(entry => entry.id === item.groupId);
        return group?.exclusiveSet?.trim() !== exclusive || item.groupId === match.id;
      })
    : drafts;

  context.draftSelections = next;
  if (!next.some(item => item.groupId === match.id)) {
    ensureDraftSelection(product, match, next, soleGroupPick(match));
  }
  // Garante preço-base do tamanho no rascunho.
  const selected = next.find(item => item.groupId === match.id);
  if (selected && !(typeof selected.basePrice === "number" && selected.basePrice > 0)) {
    selected.basePrice = sizePrice(product, match);
  }
  if (selected && !selected.groupName) selected.groupName = match.name;
  return true;
}

/** Itens por página na lista de adicionais (rodapé Pular/Pronto sempre reservado). */
/** `extraRows`: linhas fixas além do rodapé (ex.: "recomeçar" no lote). */
function addonsPageSize(total: number, offset: number, extraRows = 0) {
  const room = WA_LIST_MAX_ROWS - 1 - (offset > 0 ? 1 : 0) - extraRows;
  // Tudo cabe: sem "Ver mais".
  if (total - offset <= room) return Math.max(1, room);
  return Math.max(1, room - 1);
}

/** Offset da página anterior de adicionais (mesmo critério do "Ver mais"). */
function previousAddonsOffset(total: number, offset: number, extraRows = 0) {
  if (offset <= 0) return 0;
  let cursor = 0;
  let previous = 0;
  while (cursor < offset) {
    previous = cursor;
    cursor += addonsPageSize(total, cursor, extraRows);
    if (cursor <= previous) break;
  }
  return previous;
}

async function askAddons(
  to: string,
  product: Product,
  drafts?: CartSelection[],
  offset = 0,
  openList = false,
  batchAbort = false
) {
  const remaining = await remainingAddons(product, drafts);
  if (!remaining.length) return true;

  const picked = draftAddon(drafts)?.options.map(addonOptionLabel) ?? [];
  const prompt = withBatchAbortHint(
    [
      `*${product.name}*`,
      picked.length ? `🧀 Adicionais: ${picked.join(", ")}` : "Deseja colocar algum adicional?",
      picked.length ? "Quer outro?\n*Sim?* Escolha na lista.\n*Não?* Digite *Não* para seguir." : ""
    ]
      .filter(Boolean)
      .join("\n"),
    batchAbort
  );

  // Primeira mensagem: botões Sim + Não (sem abrir o modal).
  if (!picked.length && offset === 0 && !openList) {
    await sendButtons(
      to,
      prompt,
      appendBatchAbortButton(
        [
          { id: "choose_addon", title: "Sim" },
          { id: "skip_addon", title: "Não" }
        ],
        batchAbort
      )
    );
    return false;
  }

  const footer = !picked.length
    ? {
        id: "skip_addon",
        title: "Sem adicional",
        description: "Pular esta etapa"
      }
    : {
        id: "done_addons",
        title: "Pronto",
        description: "Seguir sem mais adicionais"
      };

  const pageSize = addonsPageSize(remaining.length, offset, batchAbort ? 1 : 0);
  const page = remaining.slice(offset, offset + pageSize);
  const hasMore = offset + page.length < remaining.length;

  const rows = page.map(addon => ({
    id: `addon:${addon.id}`,
    title: addon.name.slice(0, 24),
    description: `+ ${formatReais(addon.price)}`
  }));
  if (hasMore) {
    rows.push({
      id: "more_addons",
      title: "Ver mais",
      description: "Próximos adicionais"
    });
  }
  if (offset > 0) {
    rows.push({
      id: "prev_addons",
      title: "← Voltar",
      description: "Adicionais anteriores"
    });
  }
  // Com adicionais já escolhidos, "Pronto" no topo (celulares pequenos não veem o fim da lista).
  if (picked.length) rows.unshift(footer);
  else rows.push(footer);
  if (batchAbort) rows.push(batchAbortListRow());

  await sendList(to, prompt, "Adicionais", [
    {
      title: "Adicionais",
      rows: rows.slice(0, WA_LIST_MAX_ROWS)
    }
  ]);
  return false;
}

async function applyQuantityAndContinue(
  to: string,
  store: Store,
  product: Product,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
  quantity: number
) {
  const extras = context.draftSelections ?? [];
  context.draftItem = {
    productId: product.id,
    name: assembledName(product, extras),
    catalogName: product.name,
    quantity,
    unitPriceCents: unitPriceCents(product, extras),
    extras
  };
  context.selectedProductId = undefined;
  context.draftSelections = [];
  context.optionGroupIndex = undefined;

  if (product.notesEnabled) {
    await persist("awaiting_item_note", context);
    await askItemNote(to, context.draftItem);
    return;
  }

  const addedProductId = context.draftItem?.productId;
  commitDraftToCart(context);
  await offerDrinksOrFinish(to, store, context, persist, addedProductId);
}

/** Após gravar um item: se ainda há lote da categoria, deixa escolher o próximo; senão vai ao carrinho. */
async function finishItemOrContinueBatch(
  to: string,
  store: Store,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  if (isBatchActive(context)) {
    const total = Math.max(1, context.batchTotal ?? 1);
    const finished = batchCurrentPizzaNumber(context);
    context.batchRemaining = (context.batchRemaining ?? 1) - 1;
    if ((context.batchRemaining ?? 0) > 0) {
      context.selectedProductId = undefined;
      context.draftSelections = [];
      context.optionGroupIndex = undefined;
      context.addonOffset = 0;
      context.flavorOffset = 0;
      context.menuCategoryId = context.batchCategoryId ?? context.menuCategoryId ?? null;
      context.menuOffset = 0;
      await persist("awaiting_product", context);
      const next = batchCurrentPizzaNumber(context);
      const prefix =
        total > 1
          ? `✅ *Pizza ${finished} de ${total}* finalizada e adicionada ao carrinho!\n\n➡️ Agora vamos montar a *pizza ${next} de ${total}*:`
          : "✅ Item adicionado!";
      await showMenu(to, batchFlavorMenuIntro(context, prefix), context, persist, store);
      return;
    }
    clearBatch(context);
    context.drinksOfferMore = undefined;
    await persist("awaiting_fulfillment", context);
    const intro =
      total > 1
        ? `✅ *Pizza ${finished} de ${total}* finalizada e adicionada!\nTodas as pizzas estão no carrinho.`
        : "✅ Item adicionado!";
    await showCheckoutOptions(to, store, context, intro);
    return;
  }

  context.drinksOfferMore = undefined;
  await persist("awaiting_fulfillment", context);
  await showCartAfterAdd(to, store, context);
}

async function askQuantityStage(
  to: string,
  product: Product,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>,
  store?: Store
) {
  if (product.crustsEnabled && !crustStepDone(context.draftSelections)) {
    const crusts = crustsForPizza(product, await listCrusts());
    if (crusts.length) {
      await persist("awaiting_crust", context);
      await askCrusts(to, product, crusts, isBatchActive(context));
      return;
    }
  }
  if ((await productHasAddons(product)) && !addonStepDone(context.draftSelections)) {
    context.addonOffset = 0;
    await persist("awaiting_addon", context);
    await askAddons(to, product, context.draftSelections, 0, false, isBatchActive(context));
    return;
  }
  if (product.quantityEnabled) {
    await persist("awaiting_quantity", context);
    await askQuantity(to, product, context.draftSelections ?? [], isBatchActive(context));
    return;
  }
  // Sem flag de quantidade: 1 unidade (lote já perguntou "quantas?" no início).
  const resolvedStore = store ?? (await getStore());
  await applyQuantityAndContinue(to, resolvedStore, product, context, persist, 1);
}

async function continueProductFlow(
  to: string,
  product: Product,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  if (isBatchActive(context) && context.batchSizeName) {
    applyBatchSizeToProduct(product, context);
  }
  if (isCustomizable(product)) {
    // Segurança: com tamanho do lote já definido, nunca reabre “Escolha o tamanho”.
    let next = nextAssembly(product, context.draftSelections ?? []);
    if (next.type === "variant" && context.batchSizeName?.trim()) {
      applyBatchSizeToProduct(product, context);
      next = nextAssembly(product, context.draftSelections ?? []);
      if (next.type === "variant") {
        const locked = findProductSizeGroup(product, context.batchSizeName);
        if (locked) {
          const drafts = context.draftSelections ?? [];
          context.draftSelections = drafts.filter(item => {
            const group = activeGroups(product).find(entry => entry.id === item.groupId);
            return !isSizeGroup(group) || item.groupId === locked.id;
          });
          ensureDraftSelection(product, locked, context.draftSelections, soleGroupPick(locked));
          next = nextAssembly(product, context.draftSelections ?? []);
        }
      }
    }
    await persist("awaiting_option", context);
    if (next.type === "done") {
      await askQuantityStage(to, product, context, persist);
      return;
    }
    if (next.type === "variant") {
      await askAssembly(to, product, context);
      return;
    }
    await askGroupOptions(to, product, next.group, context.draftSelections ?? [], isBatchActive(context));
    return;
  }
  await askQuantityStage(to, product, context, persist);
}

async function finishOrder(
  to: string,
  store: Store,
  customer: Customer,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  if (!context.fulfillment || !context.paymentMethod) {
    await sendText(to, "Escolha uma forma de pagamento para continuar.");
    await askPayment(to);
    return;
  }

  const deliveryFee = resolveDeliveryFee(store, {
    neighborhoodId: context.neighborhoodId,
    address: context.fulfillment === "delivery" ? context.addressText : undefined
  });
  const cartSummary = renderCart(context);
  const addressText = context.addressText;
  const orderNotes = context.orderNotes;
  const fulfillment = context.fulfillment;
  const paymentMethod = context.paymentMethod;
  const paymentMethodLabel = context.paymentMethodLabel;
  const changeForCents = context.changeForCents;

  const order = await createOrder({
    customer,
    fulfillment: context.fulfillment,
    paymentMethod: context.paymentMethod,
    paymentMethodLabel: context.paymentMethodLabel ?? null,
    changeForCents: context.paymentMethod === "cash" ? (context.changeForCents ?? 0) : null,
    contactName: context.contactName ?? customer.name,
    addressText: context.addressText,
    notes: context.orderNotes ?? null,
    deliveryFeeCents: context.fulfillment === "delivery" ? deliveryFee.cents : 0,
    neighborhoodId:
      context.fulfillment === "delivery" ? (deliveryFee.neighborhood?.id ?? context.neighborhoodId ?? null) : null,
    neighborhoodName:
      context.fulfillment === "delivery" ? (deliveryFee.neighborhood?.name ?? context.neighborhoodName ?? null) : null,
    items: context.cart
  });

  // Mantém a conversa ativa no painel; histórico só quando o atendente encerrar.
  await recordConversationOrder(customer.id, { id: order.id, code: order.code });
  const feeLine =
    fulfillment !== "delivery"
      ? "Retirada no local"
      : deliveryFee.neighborhood
        ? `Taxa de entrega (${deliveryFee.neighborhood.name}): ${formatBRL(deliveryFee.cents)}`
        : deliveryFee.cents
          ? `Taxa de entrega: ${formatBRL(deliveryFee.cents)}`
          : "Entrega sem taxa";
  const changeLine =
    paymentMethod === "cash" ? (changeForCents ? `Troco para ${formatBRL(changeForCents)}` : "Sem troco") : "";
  await sendText(
    to,
    [
      `✅ Pedido *#${order.code}* confirmado!`,
      "",
      "🛒 *Resumo do pedido*",
      "",
      cartSummary,
      "",
      fulfillment === "delivery" ? `📍 Entrega: ${addressText ?? "a combinar"}` : "🏪 Retirada no local",
      `💳 Pagamento: ${paymentDisplayLabel(paymentMethod, paymentMethodLabel)}`,
      changeLine ? `💵 ${changeLine}` : null,
      feeLine.startsWith("Taxa") || feeLine.startsWith("Entrega") ? `🛵 ${feeLine}` : null,
      orderNotes ? `📝 Obs.: ${orderNotes}` : null,
      "",
      `💰 Total: *${formatBRL(order.totalCents)}*`,
      "",
      "Assim que o status mudar, eu te aviso por aqui. 😊",
      store.allowCustomerCancel ? CUSTOMER_CANCEL_HINT : null
    ]
      .filter((line): line is string => line != null)
      .join("\n")
  );

  // Aceite automático: vai para preparo e avisa o cliente (mesma msg do painel).
  await applyAutoAccept(order);
}

type IncomingMessageInput = {
  from: string;
  name?: string;
  avatarUrl?: string;
  text: string;
  replyId?: string;
  waMessageId?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  /** Mensagens de texto já agrupadas (v2): processa direto, sem esperar mais. */
  aiFlush?: boolean;
};

/** v2: etapas de texto livre em que mensagens picadas são agrupadas antes de processar. */
const AI_TEXT_STATES = new Set<ConversationState>([
  "awaiting_ai_order",
  "awaiting_fulfillment",
  "cart",
  "awaiting_fee_confirm",
  "awaiting_address",
  "awaiting_ai_drink",
  "awaiting_ai_change"
]);

/** v2: etapas após o carrinho em que "quero adicionar/tirar/trocar…" modifica o pedido pela IA. */
const ORDER_CHANGE_STATES: Partial<Record<ConversationState, OrderChangeContext>> = {
  awaiting_ai_drink: "drink",
  awaiting_ai_addon: "note",
  awaiting_ai_note: "note",
  awaiting_saved_address: "checkout",
  awaiting_address: "checkout",
  awaiting_neighborhood: "checkout",
  awaiting_payment: "checkout",
  awaiting_change: "checkout",
  awaiting_contact_name: "checkout"
};

const AI_CHANGE_PROMPT =
  "✏️ Claro! O que você quer *adicionar*, *remover* ou *trocar* no pedido?\nEscreva do seu jeito (ex.: *mais uma Coca 2L* ou *tira a borda*).";

function isKeepOrderText(text: string) {
  const plain = normalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(nao|n|nada|nenhum|nenhuma|deixa|deixa assim|deixa como esta|esquece|esquece isso|pode seguir|seguir|segue|continuar|ta bom|ta bom assim|nao precisa|mantem|manter|mantenha)$/.test(
    plain
  );
}
/** Espera o cliente parar de digitar antes de chamar a IA (mensagens picadas viram uma só). */
const AI_BURST_QUIET_MS = 3500;
const AI_BURST_MAX_WAIT_MS = 12_000;
const AI_COLLECTING_TTL_MS = 3 * 60 * 60 * 1000;

type AiBurst = { texts: string[]; firstAt: number; timer?: ReturnType<typeof setTimeout>; last: IncomingMessageInput };
const aiBursts = new Map<string, AiBurst>();
const aiBurstChains = new Map<string, Promise<void>>();
const aiCollecting = new Map<string, number>();

function setAiCollecting(phone: string, on: boolean) {
  const key = queueKeyForPhone(phone);
  if (on) aiCollecting.set(key, Date.now() + AI_COLLECTING_TTL_MS);
  else aiCollecting.delete(key);
}

/** Cliente está digitando o pedido na v2: textos devem ser agrupados, nunca descartados. */
export function isAiCollecting(phone: string) {
  const key = queueKeyForPhone(phone);
  const until = aiCollecting.get(key);
  if (!until) return false;
  if (until < Date.now()) {
    aiCollecting.delete(key);
    return false;
  }
  return true;
}

function bufferAiOrderText(input: IncomingMessageInput) {
  const text = input.text.trim();
  if (!text) return;
  const key = queueKeyForPhone(input.from);
  const now = Date.now();
  const burst = aiBursts.get(key) ?? { texts: [], firstAt: now, last: input };
  if (burst.timer) clearTimeout(burst.timer);
  burst.texts.push(text);
  burst.last = input;
  const wait = Math.max(0, Math.min(AI_BURST_QUIET_MS, burst.firstAt + AI_BURST_MAX_WAIT_MS - now));
  burst.timer = setTimeout(() => flushAiBurst(key), wait);
  aiBursts.set(key, burst);
}

function flushAiBurst(key: string) {
  const burst = aiBursts.get(key);
  if (!burst) return;
  aiBursts.delete(key);
  const run = async () => {
    await enqueueWaitByUser(key, () =>
      handleIncomingMessage({
        ...burst.last,
        text: burst.texts.join("\n"),
        replyId: undefined,
        location: undefined,
        aiFlush: true
      })
    );
  };
  const chain = (aiBurstChains.get(key) ?? Promise.resolve())
    .then(run)
    .catch(error => console.error("[v2] falha ao processar mensagens agrupadas", error));
  aiBurstChains.set(key, chain);
  void chain.finally(() => {
    if (aiBurstChains.get(key) === chain) aiBurstChains.delete(key);
  });
}

/** Webhook: texto que chegou com o bot ocupado (ou no meio do pedido v2) entra no agrupamento. */
export async function queueAiOrderText(input: IncomingMessageInput) {
  if (input.waMessageId) await sendTypingIndicator(input.waMessageId).catch(() => undefined);
  setAiCollecting(input.from, true);
  bufferAiOrderText(input);
}

export async function handleIncomingMessage(input: IncomingMessageInput) {
  const store = await getStore();
  const customer = await upsertCustomer(input.from, input.name, input.avatarUrl);
  const existing = await getConversation(customer.id);

  // Atendente assumiu no painel: bot fica em silêncio neste chat.
  if (existing?.handoffMode === "human") {
    await touchConversation(customer.id);
    return;
  }

  // Mostra "Digitando…" enquanto monta a resposta (some ao enviar ou em ~25s).
  if (input.waMessageId) {
    await sendTypingIndicator(input.waMessageId).catch(() => undefined);
  }

  const state: ConversationState = existing?.state ?? "welcome";
  const context = existing?.context ?? emptyContext();
  const incoming = input.replyId || input.text;
  const normalized = normalize(incoming);
  const command = normalized.replace(/[!?.,]+$/g, "").trim();

  if (
    !input.aiFlush &&
    isV2(store) &&
    AI_TEXT_STATES.has(state) &&
    !input.replyId &&
    !input.location &&
    input.text.trim()
  ) {
    setAiCollecting(input.from, true);
    bufferAiOrderText(input);
    return;
  }

  const persist = async (nextState: ConversationState, nextContext = context, options?: SaveConversationOptions) => {
    const saved = await saveConversation(customer, nextState, nextContext, options);
    setAiCollecting(input.from, isV2(store) && AI_TEXT_STATES.has(nextState));
    return saved;
  };

  /** v2: interpreta o texto do cliente com IA e monta (ou corrige) o carrinho inteiro. */
  async function handleAiOrderText(ctx: ConversationContext, text: string, opts?: { menuSent?: boolean }) {
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "user", content: text });
    const outcome = await interpretOrder(ctx.aiTurns);

    if (outcome.status === "error") {
      await persist("awaiting_ai_order", ctx);
      await sendText(input.from, "😕 Tive um probleminha para entender agora. Pode enviar seu pedido de novo?");
      return;
    }

    ctx.aiHints = mergeAiHints(ctx.aiHints, outcome.hints);

    if (outcome.menuRequested && !opts?.menuSent) {
      if (store.menuImageUrl) {
        await sendImage(input.from, store.menuImageUrl, "📋 Nosso cardápio").catch(error => {
          console.warn("[v2] falha ao enviar imagem do cardápio:", error instanceof Error ? error.message : error);
        });
      } else {
        await sendText(input.from, await menuPlainText());
      }
    }

    const notFoundLine = outcome.notFound.length
      ? `⚠️ Não encontrei no cardápio: *${outcome.notFound.join(", ")}*.`
      : null;

    if (outcome.status === "empty") {
      const helped = Boolean(outcome.answer || outcome.menuRequested || ctx.aiHints?.address || ctx.aiHints?.payment);
      const reply = [
        outcome.answer,
        notFoundLine,
        helped
          ? "✍️ Quando decidir, é só *digitar seu pedido* aqui."
          : "😕 Não consegui identificar itens do cardápio nessa mensagem. Me envie seu pedido, por favor.",
        helped ? null : AI_ORDER_EXAMPLE
      ]
        .filter(Boolean)
        .join("\n");
      ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "assistant", content: reply });
      await persist("awaiting_ai_order", ctx);
      await sendText(input.from, reply);
      return;
    }

    if (outcome.status === "question") {
      const reply = [outcome.answer, notFoundLine, outcome.question].filter(Boolean).join("\n");
      ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "assistant", content: reply });
      await persist("awaiting_ai_order", ctx);
      await sendText(input.from, reply);
      return;
    }

    ctx.cart = outcome.items;
    ctx.fulfillment = undefined;
    ctx.neighborhoodId = undefined;
    ctx.neighborhoodName = undefined;
    ctx.addressText = undefined;
    ctx.addressDraft = undefined;
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, {
      role: "assistant",
      content: [outcome.answer, `Pedido montado:\n${renderCart(ctx)}`].filter(Boolean).join("\n")
    });
    const intro = [outcome.answer, "✅ Entendi seu pedido!", notFoundLine].filter(Boolean).join("\n");
    ctx.aiExtraPhase = "addon_ask";
    ctx.aiStepIndex = undefined;
    if (!ctx.aiDrinkAsked) {
      const drinksCategoryId = await activeDrinkCategoryId();
      if (drinksCategoryId && !(await cartHasDrink(ctx, drinksCategoryId))) {
        await sendText(input.from, [intro, "", "🛒 *Seu carrinho*", "", renderCart(ctx)].join("\n"));
        await persist("awaiting_ai_drink", ctx);
        await askAiDrink(input.from);
        return;
      }
      ctx.aiDrinkAsked = true;
    }
    await nextAiExtraStep(ctx, intro);
  }

  /**
   * v2: "quero adicionar/tirar/trocar…" no meio do checkout. A IA refaz o carrinho com o histórico;
   * entrega/endereço/pagamento já escolhidos são mantidos e o cliente volta à etapa em que estava.
   */
  async function handleAiOrderChange(ctx: ConversationContext, text: string, resumeState: ConversationState) {
    ctx.aiResumeState = resumeState;
    const cartKey = (items: CartItem[]) =>
      JSON.stringify(items.map(item => [item.productId, item.name, item.quantity, item.unitPriceCents]));
    const before = cartKey(ctx.cart);
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "user", content: text });
    const outcome = await interpretOrder(ctx.aiTurns);

    if (outcome.status === "error") {
      await persist("awaiting_ai_change", ctx);
      await sendText(
        input.from,
        "😕 Tive um probleminha para entender a alteração. Pode escrever de novo o que quer mudar?"
      );
      return;
    }

    const notFoundLine = outcome.notFound.length
      ? `⚠️ Não encontrei no cardápio: *${outcome.notFound.join(", ")}*.`
      : null;

    if (outcome.status !== "ok" || cartKey(outcome.items) === before) {
      const reply = [outcome.answer, notFoundLine, outcome.status === "question" ? outcome.question : AI_CHANGE_PROMPT]
        .filter(Boolean)
        .join("\n");
      ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "assistant", content: reply });
      await persist("awaiting_ai_change", ctx);
      await sendText(input.from, reply);
      return;
    }

    ctx.cart = outcome.items;
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "assistant", content: `Pedido montado:\n${renderCart(ctx)}` });
    await resumeAfterAiChange(ctx, ["✏️ *Pedido atualizado!*", notFoundLine].filter(Boolean).join("\n"));
  }

  async function resumeAfterAiChange(ctx: ConversationContext, intro: string) {
    let target: ConversationState = ctx.aiResumeState ?? "awaiting_fulfillment";
    ctx.aiResumeState = undefined;

    if (target === "awaiting_ai_drink") {
      const drinksCategoryId = await activeDrinkCategoryId();
      if (!drinksCategoryId || (await cartHasDrink(ctx, drinksCategoryId))) {
        ctx.aiDrinkAsked = true;
        ctx.aiExtraPhase = "addon_ask";
        ctx.aiStepIndex = undefined;
        await nextAiExtraStep(ctx, intro);
        return;
      }
    }
    if (target === "awaiting_ai_addon" || target === "awaiting_ai_note") {
      // Índices do carrinho podem ter mudado: refaz a pergunta da etapa.
      ctx.aiExtraPhase = target === "awaiting_ai_addon" ? "addon_ask" : "note";
      ctx.aiStepIndex = undefined;
      ctx.addonOffset = 0;
      await nextAiExtraStep(ctx, intro);
      return;
    }

    const totalCents = orderTotalCents(store, ctx);
    if (
      ctx.paymentMethod === "cash" &&
      ctx.changeForCents &&
      ctx.changeForCents < totalCents &&
      target !== "awaiting_payment"
    ) {
      ctx.changeForCents = undefined;
      target = "awaiting_change";
    }

    const lines = [intro, "", "🛒 *Seu carrinho*", "", renderCart(ctx)];
    if (ctx.fulfillment === "delivery" && (ctx.neighborhoodId || ctx.addressText)) {
      const fee = resolveDeliveryFee(store, { neighborhoodId: ctx.neighborhoodId, address: ctx.addressText }).cents;
      lines.push(`Entrega: ${formatBRL(fee)}`, `*Total: ${formatBRL(totalCents)}*`);
    }
    await sendText(input.from, lines.join("\n"));
    await persist(target, ctx);
    await resumeCurrentStep(input.from, store, target, ctx, { afterHandoff: true });
  }

  /** v2: resposta de "Deseja uma bebida?" — IA acha as bebidas e soma ao carrinho. */
  async function handleAiDrinkText(ctx: ConversationContext, text: string) {
    const drinksCategoryId = await activeDrinkCategoryId();
    if (!drinksCategoryId) {
      ctx.aiDrinkAsked = true;
      await nextAiExtraStep(ctx);
      return;
    }
    const outcome = await interpretDrinks(text, product => product.categoryId === drinksCategoryId);

    if (outcome.status === "error") {
      await persist("awaiting_ai_drink", ctx);
      await sendText(input.from, "😕 Tive um probleminha para entender agora. Pode digitar a bebida de novo?");
      return;
    }

    const notFoundLine = outcome.notFound.length
      ? `⚠️ Não encontrei no cardápio: *${outcome.notFound.join(", ")}*.`
      : null;

    if (outcome.status === "question") {
      await persist("awaiting_ai_drink", ctx);
      await sendText(input.from, [notFoundLine, outcome.question].filter(Boolean).join("\n"));
      return;
    }

    if (outcome.status === "empty") {
      await persist("awaiting_ai_drink", ctx);
      await sendText(input.from, notFoundLine ?? "😕 Não encontrei essa bebida no cardápio.");
      await askAiDrink(input.from);
      return;
    }

    ctx.cart = [...ctx.cart, ...outcome.items];
    ctx.aiDrinkAsked = true;
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "user", content: `Bebidas: ${text}` });
    ctx.aiTurns = appendAiTurn(ctx.aiTurns, { role: "assistant", content: `Pedido montado:\n${renderCart(ctx)}` });
    ctx.aiExtraPhase = "addon_ask";
    ctx.aiStepIndex = undefined;
    const intro = ["🥤 Bebida adicionada!", notFoundLine].filter(Boolean).join("\n");
    await nextAiExtraStep(ctx, intro);
  }

  function refreshCartItem(item: CartItem, product: Product) {
    const extras = item.extras ?? [];
    item.name = extras.some(extra => extra.groupId !== ADDON_GROUP_ID) ? assembledName(product, extras) : product.name;
    item.unitPriceCents = unitPriceCents(product, extras);
  }

  /**
   * v2: depois do carrinho da IA, pergunta adicionais uma única vez (e em qual item, se houver vários)
   * e a observação uma única vez para o pedido inteiro; no fim segue para Entrega/Retirada.
   */
  async function nextAiExtraStep(ctx: ConversationContext, intro?: string) {
    const showCart = async () => {
      if (!intro) return;
      await sendText(input.from, [intro, "", "🛒 *Seu carrinho*", "", renderCart(ctx)].join("\n"));
      intro = undefined;
    };

    if (!ctx.aiExtrasAsked) {
      const asked = intro == null;
      if ((ctx.aiExtraPhase ?? "addon_ask") === "addon_ask") {
        if ((await aiAddonItems(ctx)).length) {
          ctx.aiExtraPhase = "addon_ask";
          ctx.aiStepIndex = undefined;
          ctx.addonOffset = 0;
          await showCart();
          await persist("awaiting_ai_addon", ctx);
          await askAiAddonQuestion(input.from, ctx);
          return;
        }
        ctx.aiExtraPhase = "note";
      }
      if (ctx.aiExtraPhase === "note") {
        const products = await Promise.all(ctx.cart.map(item => getProduct(item.productId)));
        if (products.some(product => product?.notesEnabled)) {
          await showCart();
          await persist("awaiting_ai_note", ctx);
          await askAiOrderNote(input.from);
          return;
        }
      }
      ctx.aiExtrasAsked = true;
      ctx.aiExtraPhase = undefined;
      ctx.aiStepIndex = undefined;
      ctx.addonOffset = 0;
      if (asked) {
        ctx.aiTurns = appendAiTurn(ctx.aiTurns, {
          role: "assistant",
          content: `Carrinho atualizado:\n${renderCart(ctx)}`
        });
      }
    }
    await continueAfterAiCart(ctx, intro ?? "✅ Pedido atualizado!");
  }

  /**
   * v2: carrinho pronto. Se o cliente já mandou o endereço, pula direto para a taxa;
   * senão mostra Entrega / Retirada / Corrigir.
   */
  async function continueAfterAiCart(ctx: ConversationContext, intro: string) {
    const hints = ctx.aiHints ?? {};
    const address = hints.fulfillment !== "pickup" ? hints.address : undefined;
    if (!address || !store.deliveryEnabled) {
      await persist("awaiting_fulfillment", ctx);
      await showAiCartOptions(input.from, store, ctx, intro);
      return;
    }
    await sendText(input.from, [intro, "", "🛒 *Seu carrinho*", "", renderCart(ctx)].join("\n"));
    ctx.fulfillment = "delivery";
    await applyTypedAddress(ctx, address);
  }

  /** Entrega: oferece o endereço do último pedido (Sim / Outro endereço); sem histórico, pede o endereço. */
  async function askDeliveryAddress(ctx: ConversationContext) {
    const saved = await findLastDeliveryAddress(customer.id);
    const zones = store.neighborhoods ?? [];
    let zone: DeliveryNeighborhood | undefined;
    if (saved && zones.length) {
      zone = zones.find(item => item.id === saved.neighborhoodId);
      if (!zone) {
        // Bairro renomeado/removido no painel: tenta achar de novo pelo texto do endereço.
        const result = matchNeighborhoodQuery(saved.addressText, zones);
        if (result.status !== "none" && result.status !== "ambiguous") zone = result.match.zone;
      }
    }
    if (!saved || (zones.length && !zone)) {
      await persist("awaiting_address", ctx);
      await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
      return;
    }
    ctx.addressText = saved.addressText;
    ctx.addressDraft = undefined;
    ctx.neighborhoodId = zone?.id;
    ctx.neighborhoodName = zone?.name;
    ctx.neighborhoodPage = null;
    await persist("awaiting_saved_address", ctx);
    await askSavedAddress(input.from, store, ctx);
  }

  /** Endereço digitado → bairro/taxa (v2 confirma a taxa; v1 segue para pagamento). */
  async function applyTypedAddress(ctx: ConversationContext, typed: string) {
    const cleaned = typed
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .join(", ");
    // Bairro digitado depois de um endereço sem bairro: junta com a rua já informada.
    const draft = ctx.addressDraft;
    ctx.addressDraft = undefined;
    const joinDraft = Boolean(draft) && !looksLikeFullAddress(cleaned);
    const address = joinDraft ? `${draft} - ${cleaned}` : cleaned;
    ctx.addressText = address;
    const zones = store.neighborhoods ?? [];

    if (!zones.length) {
      ctx.neighborhoodId = undefined;
      ctx.neighborhoodName = undefined;
      ctx.neighborhoodPage = null;
      if (isV2(store) && store.deliveryFeeCents > 0) {
        await persist("awaiting_fee_confirm", ctx);
        await askFeeConfirm(input.from, store, ctx);
        return;
      }
      await goToPayment(ctx);
      return;
    }

    const result = matchNeighborhoodQuery(address, zones);
    if (result.status === "none") {
      ctx.addressDraft = joinDraft ? draft : address;
      ctx.addressText = undefined;
      const body = [
        "😕 Não encontrei o *bairro* nesse endereço.",
        `📝 Anotei: *${ctx.addressDraft}*`,
        "Agora me diga só o *nome do bairro* (ex.: *Centro*).",
        "Se o endereço estiver errado, envie o endereço completo de novo."
      ].join("\n");
      await persist("awaiting_address", ctx);
      if (store.pickupEnabled) {
        await sendButtons(input.from, body, [{ id: "switch_pickup", title: "Quero retirar" }]);
      } else {
        await sendText(input.from, body);
      }
      return;
    }

    if (result.status === "ambiguous") {
      await persist("awaiting_address", ctx);
      await askNeighborhoodAmbiguous(input.from, result.matches);
      return;
    }

    const zone = result.match.zone;
    ctx.neighborhoodId = zone.id;
    ctx.neighborhoodName = zone.name;
    ctx.neighborhoodPage = null;
    if (isV2(store)) {
      await persist("awaiting_fee_confirm", ctx);
      await askFeeConfirm(input.from, store, ctx);
      return;
    }
    await sendText(input.from, `📍 Bairro *${zone.name}* · taxa ${formatBRL(zone.feeCents)}.`);
    await goToPayment(ctx);
  }

  /** Pagamento: na v2, usa a forma que o cliente já informou (ex.: "no pix"); senão pergunta. */
  async function goToPayment(ctx: ConversationContext) {
    const hint = isV2(store) ? ctx.aiHints?.payment?.trim() : undefined;
    const method = hint ? await resolvePaymentMethodLoose(hint) : null;
    if (!method) {
      await persist("awaiting_payment", ctx);
      await askPayment(input.from);
      return;
    }
    ctx.paymentMethod = method.kind;
    ctx.paymentMethodId = method.id;
    ctx.paymentMethodLabel = method.name;
    if (method.kind === "cash") {
      await persist("awaiting_change", ctx);
      await askChange(input.from, orderTotalCents(store, ctx));
      return;
    }
    ctx.changeForCents = undefined;
    await askContactOrFinish(ctx);
  }

  /** v2: novo atendimento — saudação + cardápio; se a 1ª mensagem já for o pedido, interpreta direto. */
  async function startConversationV2(firstText?: string) {
    const next = emptyContext();
    await persist("awaiting_ai_order", next, { reopen: true });
    const text = firstText?.trim() ?? "";
    const plain = normalize(text)
      .replace(/[!?.,]+$/g, "")
      .trim();
    const looksLikeOrder = text.length >= 8 && !GREETING_ONLY.test(plain) && !isCustomerAck(text, plain);
    if (!looksLikeOrder) {
      await showWelcomeV2(input.from, store);
      return;
    }
    await showWelcomeV2(input.from, store, { greetOnly: true });
    await handleAiOrderText(next, text, { menuSent: Boolean(store.menuImageUrl) });
  }

  /** Nome para contato: se o cliente já informou em um pedido anterior, não pergunta de novo. */
  async function askContactOrFinish(ctx: ConversationContext = context) {
    const known = ctx.contactName?.trim() || (await findLastContactName(customer.id));
    if (known) {
      ctx.contactName = known;
      await finishOrder(input.from, store, customer, ctx, persist);
      return;
    }
    await persist("awaiting_contact_name", ctx);
    await askContactName(input.from);
  }

  async function replyOpenOrderStatus(thanks = false, opts?: { offerNewOrder?: boolean }) {
    const latest = await findLatestOrder(customer.id);
    if (!latest || !isOpenOrderStatus(latest.status)) return false;
    // Não reabre Ativas: só responde o status do pedido em andamento.
    await persist("welcome", emptyContext());
    const status = formatOrderStatusMessage(latest, {
      thanks,
      allowCustomerCancel: store.allowCustomerCancel
    });
    if (opts?.offerNewOrder === false) {
      await sendText(input.from, status);
      return true;
    }
    await sendButtons(input.from, `${status}\n\nQuer fazer *outro pedido*? Toque em *Novo pedido*.`, [
      { id: "order", title: "Novo pedido" }
    ]);
    return true;
  }

  /** Novo pedido com outro ainda em andamento (Recebido/Aceito/Saiu…). */
  async function startAnotherOrder(text?: string) {
    const latest = await findLatestOrder(customer.id);
    if (latest && isOpenOrderStatus(latest.status)) {
      await sendText(
        input.from,
        `Claro! 😊 Seu pedido *#${latest.code}* continua em andamento. Vamos fazer um *novo pedido*.`
      );
    }
    if (isV2(store)) {
      await startConversationV2(text);
      return;
    }
    const next = emptyContext();
    resetMenuBrowse(next);
    await persist("awaiting_product", next, { reopen: true });
    await showMenu(input.from, "🍕 Escolha o primeiro item do novo pedido:", next, persist, store);
  }

  // Loja fechada: bloqueia novos fluxos; pedido já em andamento continua.
  // Pedido feito e ainda não entregue mantém o bot ativo até ENTREGUE (sem novo pedido).
  if (!isStoreOpen(store.businessHours, store.timezone) && !isOrderInProgress(state)) {
    const latest = await findLatestOrder(customer.id);
    if (!latest || !isOpenOrderStatus(latest.status)) {
      await sendText(input.from, closedStoreMessage(store.name, store.businessHours));
      return;
    }
    const wantsCancel = store.allowCustomerCancel && command === "cancelar pedido";
    if (!wantsCancel) {
      if (!input.replyId && isCustomerAck(input.text, command)) {
        await touchConversation(customer.id);
        return;
      }
      await replyOpenOrderStatus(false, { offerNewOrder: false });
      return;
    }
  }

  // Cancelamento do pedido pelo cliente (frase exata), se a loja permitir.
  if (store.allowCustomerCancel && command === "cancelar pedido") {
    const latest = await findLatestOrder(customer.id);
    if (latest && canCustomerCancelStatus(latest.status)) {
      await updateOrderStatus(
        latest.id,
        "cancelled",
        "Cliente WhatsApp",
        undefined,
        "Cancelado pelo cliente no WhatsApp"
      );
      await persist("welcome", emptyContext());
      await sendButtons(
        input.from,
        [
          "Seu pedido foi cancelado e seu atendimento finalizado.",
          'Caso queira fazer um novo pedido, clique em "Novo pedido".'
        ].join("\n"),
        [{ id: "order", title: "Novo pedido" }]
      );
      return;
    }
    await sendText(input.from, "Não há pedido em andamento que possa ser cancelado.");
    return;
  }

  // No fluxo de lote (tamanho/qtd/montagem): sair = recomeçar, sem encerrar atendimento.
  if (
    incoming === BATCH_ABORT_ID ||
    ((CANCEL_KEYS.includes(command) || isBatchRestartCommand(command)) && isInBatchFlow(state, context))
  ) {
    await abortBatchAndRestart(input.from, store, context, persist);
    return;
  }

  if (CANCEL_KEYS.includes(command)) {
    await persist("welcome", emptyContext(), { close: true });
    await sendText(
      input.from,
      "👋 Atendimento encerrado. Obrigado pelo contato! Quando quiser pedir de novo, é só mandar uma mensagem."
    );
    return;
  }

  // "Não" de um prompt de novo pedido antigo (ex.: conversa já encerrada pelo
  // painel): nunca inicia pedido. No meio de outro pedido, só reenvia a etapa.
  if (state !== "awaiting_new_order" && (incoming === NEW_ORDER_NO || incoming === "handoff_new_order:no")) {
    if (isOrderInProgress(state)) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    await persist("welcome", emptyContext(), { close: true });
    await declineNewOrder(input.from, store.timezone);
    return;
  }

  const idleMinutes = store.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (isConversationIdle(existing?.lastMessageAt, idleMinutes)) {
    if (incoming === "order" || (!input.replyId && wantsAnotherOrder(input.text))) {
      await startAnotherOrder(input.replyId ? undefined : input.text);
      return;
    }
    // Agradecimento / emoji após ociosidade: não responde nem reinicia o cardápio.
    if (!input.replyId && isCustomerAck(input.text, command)) {
      await touchConversation(customer.id);
      return;
    }
    // Pedido em aberto (Aceito/Saiu…): não reinicia o menu — só informa o status.
    if (await replyOpenOrderStatus()) return;
    if (isV2(store)) {
      await startConversationV2(input.replyId ? undefined : input.text);
      return;
    }
    // Bem-vindo já conta como conversa ativa no painel.
    await persist("welcome", emptyContext(), { reopen: true });
    await showWelcome(input.from, store.name);
    return;
  }

  const orderActive = isOrderInProgress(state);
  const hasReply = Boolean(input.replyId);

  // Agradecimento / emoji fora do fluxo (ex.: após despedida ou encerramento):
  // não responde nada. Não engole código de pedido.
  if (!orderActive && !hasReply && state !== "awaiting_order_code" && isCustomerAck(input.text, command)) {
    await touchConversation(customer.id);
    return;
  }

  // Localização do celular não é aceita; na etapa de endereço tratamos com mensagem própria.
  if (orderActive && input.location && state !== "awaiting_address" && state !== "awaiting_neighborhood") {
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  // Atalhos globais (menu/status/pedido) não interrompem pedido em andamento.
  // No checkout unificado, "Adicionar mais" usa id "order" em cart e awaiting_fulfillment.
  const cartAddMore =
    (state === "cart" || state === "awaiting_fulfillment") && (incoming === "order" || incoming === "order_drinks");
  const globalShortcut =
    ["menu", "status"].includes(incoming) ||
    ["menu", "ver cardapio", "cardapio", "status", "status do pedido", "meu pedido", "rastrear"].includes(normalized) ||
    (!cartAddMore && (incoming === "order" || ["fazer pedido", "pedir"].includes(normalized)));

  if (orderActive && globalShortcut) {
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  // Fora das etapas de texto livre, texto aberto sem ação reconhecida
  // é tratado pelos handlers (que reenviam a etapa) ou pelo fallback final.

  if (state === "awaiting_item_note" && context.draftItem) {
    const notes = isSkipNote(incoming, normalized) ? null : clipNote(input.text);
    if (!isSkipNote(incoming, normalized) && !notes) {
      await askItemNote(input.from, context.draftItem);
      return;
    }
    const added = context.draftItem;
    added.notes = notes;
    const addedProductId = added.productId;
    commitDraftToCart(context);
    await offerDrinksOrFinish(input.from, store, context, persist, addedProductId);
    return;
  }

  if (state === "awaiting_drinks_upsell") {
    if (wantsDrinks(incoming, normalized)) {
      await openDrinksMenu(input.from, store, context, persist);
      return;
    }
    if (isSkipDrinks(incoming, normalized)) {
      context.drinksOfferMore = undefined;
      await finishItemOrContinueBatch(input.from, store, context, persist);
      return;
    }
    await askDrinksUpsell(input.from, Boolean(context.drinksOfferMore));
    return;
  }

  if (state === "awaiting_order_note") {
    if (!ORDER_NOTE_STEP_ENABLED) {
      if (!context.cart.length) {
        await persist("awaiting_product", context);
        await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:", context);
        return;
      }
      if (!context.fulfillment) {
        await persist("awaiting_fulfillment", context);
        await showCheckoutOptions(input.from, store, context, "✅ Continue seu pedido");
        return;
      }
      await persist("awaiting_payment", context);
      await askPayment(input.from);
      return;
    }
    if (!context.cart.length) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:", context);
      return;
    }
    const notes = isSkipNote(incoming, normalized) ? null : clipNote(input.text);
    if (!isSkipNote(incoming, normalized) && !notes) {
      await askOrderNote(input.from);
      return;
    }
    context.orderNotes = notes;
    if (!context.fulfillment) {
      await persist("awaiting_fulfillment", context);
      await showCheckoutOptions(input.from, store, context, "✅ Continue seu pedido");
      return;
    }
    await persist("awaiting_payment", context);
    await askPayment(input.from);
    return;
  }

  if (state === "awaiting_new_order") {
    const yes =
      incoming === NEW_ORDER_YES ||
      incoming === "handoff_new_order:yes" ||
      ["sim", "s", "yes", "quero", "order", "fazer pedido", "pedir"].includes(normalized);
    const no =
      incoming === NEW_ORDER_NO || incoming === "handoff_new_order:no" || ["nao", "n", "no"].includes(normalized);

    if (yes) {
      const next = emptyContext();
      if (isV2(store)) {
        await persist("awaiting_ai_order", next, { reopen: true });
        await askAiOrder(input.from, "🍕 Vamos lá! *Digite seu pedido* aqui, do seu jeito.");
        return;
      }
      resetMenuBrowse(next);
      await persist("awaiting_product", next);
      await showMenu(input.from, "🍕 Vamos montar seu pedido. Escolha o primeiro item:", next, persist, store);
      return;
    }
    if (no) {
      // Despedida explícita: fecha Ativas p/ o job de ociosidade não avisar de novo.
      await persist("welcome", emptyContext(), { close: true });
      await declineNewOrder(input.from, store.timezone);
      return;
    }
    await persist("awaiting_new_order", context);
    await askNewOrderPrompt(input.from);
    return;
  }

  // v2: pedido de alteração no meio do checkout — IA ajusta o carrinho e volta à mesma etapa.
  const changeContext = ORDER_CHANGE_STATES[state];
  if (
    isV2(store) &&
    changeContext &&
    context.cart.length &&
    !hasReply &&
    !input.location &&
    input.text.trim() &&
    looksLikeOrderChange(input.text, changeContext)
  ) {
    await handleAiOrderChange(context, input.text.trim(), state);
    return;
  }

  if (state === "awaiting_ai_change") {
    const text = input.text.trim();
    if (!hasReply && text && isKeepOrderText(text)) {
      await resumeAfterAiChange(context, "👍 Ok, seu pedido continua igual.");
      return;
    }
    if (!text || hasReply) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    await handleAiOrderChange(context, text, context.aiResumeState ?? "awaiting_fulfillment");
    return;
  }

  if (state === "awaiting_ai_order") {
    const text = input.text.trim();
    if (!text || hasReply) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    await handleAiOrderText(context, text);
    return;
  }

  if (state === "awaiting_ai_drink") {
    const text = input.text.trim();
    if (
      incoming === "skip_drinks" ||
      (!hasReply && text && (isSkipDrinks(incoming, normalized) || isAddonsDoneText(text)))
    ) {
      context.aiDrinkAsked = true;
      context.aiExtraPhase = "addon_ask";
      context.aiStepIndex = undefined;
      await nextAiExtraStep(context);
      return;
    }
    if (!text || hasReply) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    await handleAiDrinkText(context, text);
    return;
  }

  if (state === "awaiting_ai_addon") {
    const phase = context.aiExtraPhase ?? "addon_ask";
    const eligible = await aiAddonItems(context);
    const goToNote = async () => {
      context.aiExtraPhase = "note";
      context.aiStepIndex = undefined;
      context.addonOffset = 0;
      await nextAiExtraStep(context);
    };
    const openItem = async (index: number) => {
      const target = eligible.find(entry => entry.index === index);
      if (!target) {
        await goToNote();
        return;
      }
      context.aiExtraPhase = "addon";
      context.aiStepIndex = index;
      context.addonOffset = 0;
      await persist("awaiting_ai_addon", context);
      const label = { ...target.product, name: target.item.name };
      if (await askAddons(input.from, label, target.item.extras, 0, true)) await goToNote();
    };

    if (!eligible.length) {
      await goToNote();
      return;
    }

    if (phase === "addon_ask" || phase === "addon_more") {
      const plain = normalize(input.text)
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const yes =
        incoming === "choose_addon" ||
        (!hasReply && /^(s|sim|ss|quero|quero sim|pode|pode ser|adicional|adicionais|coloca|bota)$/.test(plain));
      if (incoming === "skip_addon" || (!hasReply && isAddonsDoneText(input.text))) {
        await goToNote();
        return;
      }
      if (!yes) {
        await persist("awaiting_ai_addon", context);
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      if (eligible.length === 1) {
        await openItem(eligible[0].index);
        return;
      }
      context.aiExtraPhase = "addon_pick";
      await persist("awaiting_ai_addon", context);
      await askAiAddonItemPick(input.from, context);
      return;
    }

    if (phase === "addon_pick") {
      if (incoming.startsWith("aiitem:")) {
        await openItem(Number(incoming.slice("aiitem:".length)));
        return;
      }
      if (incoming === "skip_addon" || (!hasReply && isAddonsDoneText(input.text))) {
        await goToNote();
        return;
      }
      await persist("awaiting_ai_addon", context);
      await askAiAddonItemPick(input.from, context);
      return;
    }

    const index = context.aiStepIndex ?? 0;
    const item = context.cart[index];
    const product = item ? await getProduct(item.productId) : null;
    if (!item || !product) {
      await goToNote();
      return;
    }
    const label = { ...product, name: item.name };
    const drafts = item.extras ?? [];
    // Terminou este item: com vários itens, oferece adicional em outro; senão vai para a observação.
    const nextItem = async () => {
      refreshCartItem(item, product);
      context.addonOffset = 0;
      context.aiStepIndex = undefined;
      if (eligible.length > 1) {
        context.aiExtraPhase = "addon_more";
        await persist("awaiting_ai_addon", context);
        await askAiAddonQuestion(input.from, context, true);
        return;
      }
      await goToNote();
    };

    if (incoming === "choose_addon" || normalized === "sim" || normalized === "adicionais") {
      context.addonOffset = 0;
      await persist("awaiting_ai_addon", context);
      if (await askAddons(input.from, label, drafts, 0, true)) await nextItem();
      return;
    }
    if (incoming === "more_addons" || incoming === "prev_addons") {
      const total = (await remainingAddons(product, drafts)).length;
      const offset = context.addonOffset ?? 0;
      context.addonOffset =
        incoming === "more_addons" ? offset + addonsPageSize(total, offset) : previousAddonsOffset(total, offset);
      await persist("awaiting_ai_addon", context);
      if (await askAddons(input.from, label, drafts, context.addonOffset, incoming === "prev_addons")) await nextItem();
      return;
    }
    if (incoming === "done_addons" || incoming === "skip_addon" || (!hasReply && isAddonsDoneText(input.text))) {
      await nextItem();
      return;
    }

    const remaining = await remainingAddons(product, drafts);
    const typed = !hasReply && normalized.length >= 3 ? normalized : null;
    const addon = incoming.startsWith("addon:")
      ? remaining.find(entry => entry.id === incoming.slice("addon:".length))
      : typed
        ? (remaining.find(entry => normalize(entry.name) === typed) ??
          remaining.find(entry => normalize(entry.name).includes(typed)))
        : undefined;
    if (!addon) {
      await persist("awaiting_ai_addon", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    item.extras = addDraftAddon(drafts, addon);
    refreshCartItem(item, product);
    context.addonOffset = 0;
    if (!(await remainingAddons(product, item.extras)).length) {
      await nextItem();
      return;
    }
    await persist("awaiting_ai_addon", context);
    await askAddons(input.from, { ...product, name: item.name }, item.extras, 0, false);
    return;
  }

  if (state === "awaiting_ai_note") {
    const skip =
      isSkipNote(incoming, normalized) || ["nao", "não", "sem", "nada", "nenhum", "sem obs"].includes(command);
    const notes = skip ? null : clipNote(input.text);
    if (!skip && !notes) {
      await askAiOrderNote(input.from);
      return;
    }
    context.orderNotes = notes;
    context.aiExtraPhase = "done";
    context.aiStepIndex = undefined;
    await nextAiExtraStep(context);
    return;
  }

  if (state === "awaiting_fee_confirm") {
    if (isFeeAccept(incoming, normalized)) {
      await goToPayment(context);
      return;
    }
    if (wantsSwitchToPickup(incoming, normalized) && store.pickupEnabled) {
      context.fulfillment = "pickup";
      context.neighborhoodId = undefined;
      context.neighborhoodName = undefined;
      context.neighborhoodPage = null;
      context.addressText = undefined;
      context.addressDraft = undefined;
      if (context.aiHints) context.aiHints = { ...context.aiHints, fulfillment: "pickup", address: undefined };
      await goToPayment(context);
      return;
    }
    if (isAiFix(incoming, normalized)) {
      await persist("awaiting_ai_order", context);
      await sendText(
        input.from,
        "✏️ O que você quer mudar? Escreva do seu jeito (ex.: *troca a coca por guaraná* ou *o endereço é Rua X, 10 - Centro*)."
      );
      return;
    }
    const typedPayment = !hasReply && input.text.trim() ? await resolvePaymentMethodLoose(input.text) : null;
    if (typedPayment) {
      context.aiHints = { ...context.aiHints, payment: typedPayment.name };
      await goToPayment(context);
      return;
    }
    // Texto livre (ex.: outro endereço, "mais uma coca") = ajuste pela IA.
    if (!hasReply && input.text.trim()) {
      await handleAiOrderText(context, input.text.trim());
      return;
    }
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  if (isV2(store) && ["menu", "ver cardapio", "cardapio", "order", "fazer pedido", "pedir"].includes(normalized)) {
    await startConversationV2();
    return;
  }

  if (["menu", "ver cardapio", "cardapio"].includes(normalized)) {
    resetMenuBrowse(context);
    await persist("awaiting_product", context);
    await showMenu(input.from, "📋 Escolha um item do cardápio:", context, persist, store);
    return;
  }

  if (["order", "fazer pedido", "pedir"].includes(normalized)) {
    resetMenuBrowse(context);
    await persist("awaiting_product", context);
    await showMenu(
      input.from,
      context.cart.length ? "📋 Escolha o próximo item:" : "🍕 Vamos montar seu pedido. Escolha o primeiro item:",
      context,
      persist,
      store
    );
    return;
  }

  if (["status", "status do pedido", "meu pedido", "rastrear"].includes(normalized)) {
    const latest = await findLatestOrder(customer.id);
    if (latest) {
      await persist("welcome", context);
      await sendText(
        input.from,
        formatOrderStatusMessage(latest, {
          allowCustomerCancel: store.allowCustomerCancel
        })
      );
      return;
    }
    await persist("awaiting_order_code", context);
    await sendText(input.from, "🔎 Me envie o código do pedido (ex.: A7K2).");
    return;
  }

  if (!orderActive && !hasReply && wantsAnotherOrder(input.text)) {
    await startAnotherOrder(input.text);
    return;
  }

  // Após o pedido (conversa em welcome/fechada), texto livre não reinicia o menu
  // enquanto houver pedido em aberto — responde o status (com "Por nada" se for ack).
  if (!orderActive && !hasReply && (await replyOpenOrderStatus(isCustomerAck(input.text, command)))) {
    return;
  }

  // Fora do pedido e sem pedido em aberto, texto livre volta ao menu inicial.
  if (state === "welcome" && !hasReply) {
    if (isV2(store)) {
      await startConversationV2(input.text);
      return;
    }
    await persist("welcome", context, { reopen: true });
    await showWelcome(input.from, store.name);
    return;
  }

  if (state === "awaiting_option" && context.selectedProductId) {
    const product = await getProduct(context.selectedProductId);
    if (!product || !isCustomizable(product)) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha um item do cardápio:", context);
      return;
    }

    const drafts = context.draftSelections ?? [];
    context.draftSelections = drafts;
    const pending = nextAssembly(product, drafts);

    const goNext = async () => {
      const following = nextAssembly(product, drafts);
      if (following.type === "done") {
        context.optionGroupIndex = undefined;
        await askQuantityStage(input.from, product, context, persist);
        return;
      }
      await persist("awaiting_option", context);
      const finished = await askAssembly(input.from, product, context);
      if (finished) {
        context.optionGroupIndex = undefined;
        await askQuantityStage(input.from, product, context, persist);
      }
    };

    if (incoming === "more_options" || normalized === "mais um") {
      const group = await groupWantingMore(product, drafts);
      if (!group) {
        await goNext();
        return;
      }
      await persist("awaiting_option", context);
      const finished = await askGroupOptions(input.from, product, group, drafts, isBatchActive(context));
      if (finished) await goNext();
      return;
    }

    if (incoming === "done_options" || normalized === "pronto") {
      const openGroup = await groupWantingMore(product, drafts);
      const current = openGroup ? drafts.find(item => item.groupId === openGroup.id) : null;
      if (current?.options.length) {
        await goNext();
        return;
      }
    }

    if (incoming === "choose_flavor" || normalized === "escolher sabor") {
      const openGroup = await groupWantingMore(product, drafts);
      const pendingGroup = pending.type === "options" ? pending.group : null;
      const group =
        (openGroup && usesCatalogFlavors(openGroup) ? openGroup : null) ??
        (pendingGroup && usesCatalogFlavors(pendingGroup) ? pendingGroup : null);
      if (!group) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      context.flavorOffset = 0;
      await persist("awaiting_option", context);
      const finished = await showFlavorList(
        input.from,
        product,
        group,
        drafts,
        context.flavorOffset ?? 0,
        isBatchActive(context)
      );
      if (finished) await goNext();
      return;
    }

    if (incoming === "more_flavors") {
      const openGroup = await groupWantingMore(product, drafts);
      const pendingGroup = pending.type === "options" ? pending.group : null;
      const group =
        (openGroup && usesCatalogFlavors(openGroup) ? openGroup : null) ??
        (pendingGroup && usesCatalogFlavors(pendingGroup) ? pendingGroup : null);
      if (!group) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      context.flavorOffset = (context.flavorOffset ?? 0) + 8;
      await persist("awaiting_option", context);
      await showFlavorList(input.from, product, group, drafts, context.flavorOffset, isBatchActive(context));
      return;
    }

    if (incoming.startsWith("flavor:") || incoming.startsWith("opt:")) {
      const optionId = incoming.includes(":") ? incoming.slice(incoming.indexOf(":") + 1) : "";
      const openGroup = await groupWantingMore(product, drafts);
      const pendingGroup = pending.type === "options" ? pending.group : null;
      const group =
        (openGroup && usesCatalogFlavors(openGroup) ? openGroup : null) ??
        (pendingGroup && usesCatalogFlavors(pendingGroup) ? pendingGroup : null) ??
        (openGroup?.options.some(item => item.id === optionId) ? openGroup : null) ??
        (pendingGroup?.options.some(item => item.id === optionId) ? pendingGroup : null) ??
        activeGroups(product).find(
          item => item.options.some(option => option.id === optionId) && drafts.some(draft => draft.groupId === item.id)
        ) ??
        activeGroups(product).find(item => item.options.some(option => option.id === optionId));

      let option = group?.options.find(item => item.id === optionId) ?? null;
      if (group && usesCatalogFlavors(group) && !option) {
        const pizza = (await pizzaFlavorChoices(product.pizzaKind, [product.id])).find(item => item.id === optionId);
        if (pizza) {
          option = { id: pizza.id, name: pizza.name, extraPrice: 0, sortOrder: 0, active: true };
        }
      }

      if (!group || !option) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      const current = ensureDraftSelection(product, group, drafts);
      if (!current.options.some(item => item.id === option.id)) {
        current.options.push({
          id: option.id,
          name: option.name,
          extraPrice: option.extraPrice
        });
      }
      await persist("awaiting_option", context);

      if (current.options.length >= group.maxSelect) {
        context.flavorOffset = 0;
        await goNext();
        return;
      }

      const minReached = usesCatalogFlavors(group)
        ? current.options.length >= 1
        : current.options.length >= Math.max(group.required ? 1 : 0, group.minSelect);

      if (minReached) {
        const canAddMore = Boolean(await groupWantingMore(product, drafts));
        // Sabores do cardápio: com 2+ sabores, botões Escolher sabor + Pronto.
        if (usesCatalogFlavors(group) && canAddMore) {
          context.flavorOffset = 0;
          await persist("awaiting_option", context);
          if (current.options.length >= 2) {
            await sendButtons(
              input.from,
              withBatchAbortHint(
                groupPrompt(
                  product,
                  group,
                  current.options.map(item => item.id),
                  current.options.map(item => item.name)
                ),
                isBatchActive(context)
              ),
              appendBatchAbortButton(
                [
                  { id: "choose_flavor", title: "Escolher sabor" },
                  { id: "done_options", title: "Pronto" }
                ],
                isBatchActive(context)
              )
            );
            return;
          }
          // 1 sabor extra já escolhido → Escolher sabor + Só este sabor.
          await sendButtons(
            input.from,
            withBatchAbortHint(
              groupPrompt(
                product,
                group,
                current.options.map(item => item.id),
                current.options.map(item => item.name)
              ),
              isBatchActive(context)
            ),
            appendBatchAbortButton(
              [
                { id: "choose_flavor", title: "Escolher sabor" },
                { id: "skip_group", title: "Só este sabor" }
              ],
              isBatchActive(context)
            )
          );
          return;
        }
        const shares =
          flavorShareLine(
            product.name,
            current.options.map(item => item.name)
          ) || current.options.map(item => item.name).join(" + ");
        const label = usesCatalogFlavors(group)
          ? `*${productBaseLabel(product.name)} ${group.name}*\n${shares}`
          : `*${group.name}:*\n${shares}`;
        await sendButtons(
          input.from,
          withBatchAbortHint(label, isBatchActive(context)),
          appendBatchAbortButton(
            canAddMore
              ? [
                  { id: "more_options", title: "Mais um" },
                  { id: "done_options", title: "Pronto" }
                ]
              : [{ id: "done_options", title: "Pronto" }],
            isBatchActive(context)
          )
        );
        return;
      }
      await askGroupOptions(input.from, product, group, drafts, isBatchActive(context));
      return;
    }

    if (pending.type === "variant") {
      const group = findVariant(incoming, normalized, pending.groups);
      if (!group) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      ensureDraftSelection(product, group, drafts, soleGroupPick(group));
      await goNext();
      return;
    }

    if (pending.type === "options") {
      const group = pending.group;
      const current = ensureDraftSelection(product, group, drafts);

      if (isSkipStep(incoming, normalized)) {
        const catalogFlavors = usesCatalogFlavors(group);
        if (!catalogFlavors && group.required && current.options.length < Math.max(1, group.minSelect)) {
          await resumeCurrentStep(input.from, store, state, context);
          return;
        }
        current.skipped = current.options.length === 0;
        await goNext();
        return;
      }

      // Texto aberto / ação inválida nesta etapa de opções → reenvia a etapa.
      if (
        !hasReply &&
        !incoming.startsWith("flavor:") &&
        !incoming.startsWith("opt:") &&
        !incoming.startsWith("var:")
      ) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }

      const finished = await askAssembly(input.from, product, context);
      if (finished) await goNext();
      return;
    }

    // Montagem concluída (pending = done) → avança; senão reenvia a etapa.
    if (pending.type === "done") {
      await goNext();
      return;
    }
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  if (state === "awaiting_crust" && !incoming.startsWith("product:")) {
    const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
    if (!product) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Escolha um item do cardápio:", context);
      return;
    }

    const crusts = crustsForPizza(product, await listCrusts());
    if (!crusts.length) {
      await askQuantityStage(input.from, product, context, persist);
      return;
    }

    const crust = incoming.startsWith("crust:")
      ? crusts.find(item => item.id === incoming.slice("crust:".length))
      : crusts.find(item => normalize(item.name) === normalized);

    if (!crust) {
      await persist("awaiting_crust", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    context.draftSelections = setDraftCrust(context.draftSelections ?? [], crust);
    await askQuantityStage(input.from, product, context, persist);
    return;
  }

  if (state === "awaiting_addon" && !incoming.startsWith("product:")) {
    const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
    if (!product) {
      await persist("awaiting_product", context);
      await showMenu(input.from, "Escolha um item do cardápio:", context);
      return;
    }

    const drafts = context.draftSelections ?? [];
    const picked = draftAddon(drafts)?.options ?? [];
    const finishAddons = async () => {
      if (!picked.length) {
        context.draftSelections = skipDraftAddon(drafts);
      }
      await askQuantityStage(input.from, product, context, persist);
    };

    // Só lista/botões — texto digitado (ex.: "ovo") não escolhe adicional.
    const addonAction =
      incoming.startsWith("addon:") ||
      incoming === "choose_addon" ||
      incoming === "skip_addon" ||
      incoming === "more_addons" ||
      incoming === "prev_addons" ||
      incoming === "done_addons" ||
      incoming === "more_options" ||
      incoming === "prev_options" ||
      incoming === "done_options" ||
      normalized === "adicionais" ||
      normalized === "sim" ||
      (!hasReply && isAddonsDoneText(input.text));

    if (!addonAction) {
      await persist("awaiting_addon", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    if (incoming === "choose_addon" || normalized === "adicionais" || normalized === "sim") {
      context.addonOffset = 0;
      await persist("awaiting_addon", context);
      const finished = await askAddons(input.from, product, drafts, 0, true, isBatchActive(context));
      if (finished) await finishAddons();
      return;
    }

    if (incoming === "more_addons" || incoming === "more_options") {
      const total = (await remainingAddons(product, drafts)).length;
      const offset = context.addonOffset ?? 0;
      context.addonOffset = offset + addonsPageSize(total, offset, isBatchActive(context) ? 1 : 0);
      await persist("awaiting_addon", context);
      const finished = await askAddons(input.from, product, drafts, context.addonOffset, false, isBatchActive(context));
      if (finished) await finishAddons();
      return;
    }

    if (incoming === "prev_addons" || incoming === "prev_options") {
      const total = (await remainingAddons(product, drafts)).length;
      context.addonOffset = previousAddonsOffset(total, context.addonOffset ?? 0, isBatchActive(context) ? 1 : 0);
      await persist("awaiting_addon", context);
      const finished = await askAddons(input.from, product, drafts, context.addonOffset, true, isBatchActive(context));
      if (finished) await finishAddons();
      return;
    }

    if (incoming === "done_addons" || incoming === "done_options") {
      context.addonOffset = 0;
      await finishAddons();
      return;
    }

    if (incoming === "skip_addon") {
      context.addonOffset = 0;
      context.draftSelections = skipDraftAddon(drafts);
      await askQuantityStage(input.from, product, context, persist);
      return;
    }

    if (!hasReply && isAddonsDoneText(input.text)) {
      context.addonOffset = 0;
      await finishAddons();
      return;
    }

    const available = await productAddons(product);
    const remaining = await remainingAddons(product, drafts);
    const addonId = incoming.slice("addon:".length);
    const addon = remaining.find(item => item.id === addonId) ?? available.find(item => item.id === addonId);

    if (!addon) {
      await persist("awaiting_addon", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    context.draftSelections = addDraftAddon(drafts, addon);
    context.addonOffset = 0;
    await persist("awaiting_addon", context);

    if (!(await remainingAddons(product, context.draftSelections)).length) {
      await askQuantityStage(input.from, product, context, persist, store);
      return;
    }
    // Próxima lista já inclui "Pronto" — sem mensagem extra Mais um/Pronto.
    await askAddons(input.from, product, context.draftSelections, 0, false, isBatchActive(context));
    return;
  }

  if (state === "awaiting_product") {
    if (incoming.startsWith("menucat:")) {
      const categoryId = incoming.slice("menucat:".length);
      context.menuCategoryId = categoryId;
      context.menuOffset = 0;
      if (!isBatchActive(context) && categoryUsesBatch(store, categoryId)) {
        const categories = productCategories(await listProducts());
        const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";
        await startCategoryBatch(input.from, categoryId, categoryName, context, persist);
        return;
      }
      await persist("awaiting_product", context);
      await showMenu(input.from, productMenuIntro(context), context, persist, store);
      return;
    }
    if (incoming === "menu:more_cats") {
      context.menuOffset = (context.menuOffset ?? 0) + 9;
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha uma categoria:", context, persist, store);
      return;
    }
    if (incoming === "menu:more_items") {
      const catalog = await listProducts();
      const inCategory = context.menuCategoryId
        ? catalog.filter(item => (item.categoryId || item.categoryName || "cardapio") === context.menuCategoryId)
        : catalog;
      const canGoBack = canGoBackToCategories(context, productCategories(catalog).length);
      const offset = context.menuOffset ?? 0;
      context.menuOffset = offset + menuItemsPageSize(inCategory.length, offset, canGoBack, isBatchActive(context));
      await persist("awaiting_product", context);
      await showMenu(input.from, productMenuIntro(context), context, persist, store);
      return;
    }
    if (incoming === "menu:prev_items") {
      const catalog = await listProducts();
      const inCategory = context.menuCategoryId
        ? catalog.filter(item => (item.categoryId || item.categoryName || "cardapio") === context.menuCategoryId)
        : catalog;
      const canGoBack = canGoBackToCategories(context, productCategories(catalog).length);
      context.menuOffset = previousMenuItemsOffset(
        inCategory.length,
        context.menuOffset ?? 0,
        canGoBack,
        isBatchActive(context)
      );
      await persist("awaiting_product", context);
      await showMenu(input.from, productMenuIntro(context), context, persist, store);
      return;
    }
    if (incoming === "menu:back_cats") {
      if (context.menuLockCategory) {
        await persist("awaiting_product", context);
        await showMenu(input.from, productMenuIntro(context), context, persist, store);
        return;
      }
      clearBatch(context);
      context.menuCategoryId = null;
      context.menuOffset = 0;
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha uma categoria:", context, persist, store);
      return;
    }

    const productId = incoming.startsWith("product:") ? incoming.slice("product:".length) : null;
    const catalog = await listProducts();
    const product = productId ? await getProduct(productId) : findProductByText(catalog, normalized);

    if (!product) {
      await persist("awaiting_product", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    // Em lote ativo, não zera o contador — só troca o item da próxima unidade.
    if (isBatchActive(context)) {
      context.batchProductId = product.id;
      context.menuCategoryId = context.batchCategoryId ?? product.categoryId;
    } else {
      clearBatch(context);
      resetMenuBrowse(context);
    }

    context.selectedProductId = product.id;
    context.draftSelections = [];
    context.optionGroupIndex = 0;
    context.addonOffset = 0;
    context.flavorOffset = 0;

    await continueProductFlow(input.from, product, context, persist);
    return;
  }

  if (state === "awaiting_batch_size") {
    const categoryId = context.menuCategoryId ?? context.batchCategoryId ?? null;
    const categories = productCategories(await listProducts());
    const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";
    const sizes = categoryId ? await sizesForCategory(categoryId) : [];

    const sizeId = incoming.startsWith("batchsize:") ? incoming.slice("batchsize:".length) : null;
    const picked =
      (sizeId ? sizes.find(item => item.id === sizeId) : null) ??
      sizes.find(item => normalize(item.name) === normalized) ??
      null;

    if (!categoryId || !picked) {
      if (!sizes.length) {
        await persist("awaiting_batch_count", context);
        await askBatchCount(input.from, categoryName);
        return;
      }
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    context.batchSizeName = picked.name;
    context.batchMaxFlavors = Math.max(1, picked.maxSelect ?? 1);
    context.menuCategoryId = categoryId;
    await persist("awaiting_batch_count", context);
    await askBatchCount(input.from, categoryName);
    return;
  }

  if (state === "awaiting_batch_count") {
    const categoryId = context.menuCategoryId ?? context.batchCategoryId ?? null;
    const categories = productCategories(await listProducts());
    const categoryName = categories.find(item => item.id === categoryId)?.name ?? "Categoria";

    const confirmNo =
      incoming === "qtyconfirm:no" || normalized === "corrigir" || normalized === "nao" || normalized === "não";
    if (confirmNo) {
      context.batchCountPending = undefined;
      await persist("awaiting_batch_count", context);
      await sendText(input.from, "Sem problema! Quantas *pizzas* você quer?");
      await askBatchCount(input.from, categoryName);
      return;
    }

    let quantity: number | null = null;
    if (incoming.startsWith("qtyconfirm:")) {
      const parsed = Number(incoming.slice("qtyconfirm:".length));
      if (Number.isInteger(parsed) && parsed >= 1) quantity = parsed;
    } else if (
      context.batchCountPending != null &&
      (normalized === "sim" ||
        normalized === "confirmo" ||
        normalized === "confirmado" ||
        normalized.startsWith("sim "))
    ) {
      quantity = context.batchCountPending;
    } else if (looksLikeSliceCount(incoming)) {
      context.batchCountPending = undefined;
      await persist("awaiting_batch_count", context);
      await sendText(
        input.from,
        "Aqui a pergunta é *quantas pizzas*, não fatias.\nEx.: digite *1*, *2* ou *3* (ou use os botões)."
      );
      await askBatchCount(input.from, categoryName);
      return;
    } else {
      quantity = parseQuantity(incoming);
    }

    if (!categoryId || quantity == null) {
      await sendText(input.from, "Informe quantas *pizzas* (1 a 20). Pode digitar por extenso, ex.: três.");
      await askBatchCount(input.from, categoryName);
      return;
    }

    if (quantity > BATCH_QTY_HARD_MAX) {
      context.batchCountPending = undefined;
      await persist("awaiting_batch_count", context);
      await sendText(
        input.from,
        `O máximo por vez é *${BATCH_QTY_HARD_MAX} pizzas*. Se precisar de mais, feche este pedido e faça outro.`
      );
      await askBatchCount(input.from, categoryName);
      return;
    }

    if (quantity > BATCH_QTY_SOFT_MAX && !incoming.startsWith("qtyconfirm:")) {
      context.batchCountPending = quantity;
      await persist("awaiting_batch_count", context);
      await askBatchCountConfirm(input.from, quantity);
      return;
    }

    context.batchCountPending = undefined;
    context.batchCategoryId = categoryId;
    context.menuCategoryId = categoryId;
    context.batchRemaining = quantity;
    context.batchTotal = quantity;
    context.batchCartStartLength = context.cart.length;
    context.batchProductId = undefined;
    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = 0;
    context.addonOffset = 0;
    context.flavorOffset = 0;
    context.menuOffset = 0;
    await persist("awaiting_product", context);
    await showMenu(input.from, batchFlavorMenuIntro(context), context, persist, store);
    return;
  }

  if (state === "awaiting_quantity") {
    const quantity = parseQuantity(incoming);
    const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;

    if (!product || quantity == null) {
      await sendText(input.from, "Informe um número.");
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    const extras = context.draftSelections ?? [];
    context.draftItem = {
      productId: product.id,
      name: assembledName(product, extras),
      catalogName: product.name,
      quantity,
      unitPriceCents: unitPriceCents(product, extras),
      extras
    };
    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = undefined;

    if (product.notesEnabled) {
      await persist("awaiting_item_note", context);
      await askItemNote(input.from, context.draftItem);
      return;
    }

    const addedProductId = context.draftItem?.productId;
    commitDraftToCart(context);
    await offerDrinksOrFinish(input.from, store, context, persist, addedProductId);
    return;
  }

  if (
    (state === "cart" || state === "awaiting_fulfillment") &&
    (incoming === "clear_cart" ||
      normalized === "clear_cart" ||
      normalized === "limpar carrinho" ||
      command === "limpar carrinho")
  ) {
    context.cart = [];
    await persist("welcome", emptyContext(), { close: true });
    await sendText(input.from, "Carrinho limpo. É só chamar quando quiser pedir de novo.");
    return;
  }

  if (isV2(store) && (state === "cart" || state === "awaiting_fulfillment")) {
    if (isAiFix(incoming, normalized)) {
      await persist("awaiting_ai_order", context);
      await sendText(
        input.from,
        "✏️ O que você quer mudar? Escreva do seu jeito (ex.: *troca a coca por guaraná* ou *adiciona uma pizza pequena de chocolate*)."
      );
      return;
    }
    const raw = incoming.startsWith("fulfillment:") ? incoming.slice("fulfillment:".length) : normalized;
    const isFulfillment = ["delivery", "entrega", "pickup", "retirada"].includes(raw);
    // Texto livre no carrinho (ex.: "e mais uma coca") = ajuste do pedido pela IA.
    if (!isFulfillment && !hasReply && input.text.trim() && incoming !== "checkout") {
      await handleAiOrderText(context, input.text.trim());
      return;
    }
  }

  if (state === "cart" || state === "awaiting_fulfillment") {
    if (!context.cart.length) {
      resetMenuBrowse(context);
      await persist("awaiting_product", context);
      await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:", context, persist, store);
      return;
    }
    if (
      incoming === "order_drinks" ||
      normalized === "adicionar uma bebida" ||
      normalized === "adicionar bebida" ||
      normalized === "bebida"
    ) {
      clearBatch(context);
      const drinks = await findDrinksCategory();
      if (!drinks) {
        await sendText(input.from, "Não encontrei a categoria de bebidas no cardápio.");
        await showCheckoutOptions(input.from, store, context, "🛒 Seu pedido");
        return;
      }
      context.menuCategoryId = drinks.id;
      context.menuOffset = 0;
      context.menuLockCategory = true;
      await persist("awaiting_product", context);
      await showMenu(input.from, `🥤 *${drinks.name}*\nEscolha uma bebida:`, context, persist, store);
      return;
    }
    if (incoming === "order" || normalized === "adicionar mais" || normalized === "adicionar mais itens") {
      clearBatch(context);
      resetMenuBrowse(context);
      await persist("awaiting_product", context);
      await showMenu(input.from, "Escolha o próximo item:", context, persist, store);
      return;
    }
    if (
      incoming === "checkout" ||
      normalized === "checkout" ||
      normalized === "fechar pedido" ||
      command === "fechar pedido"
    ) {
      await persist("awaiting_fulfillment", context);
      await showCheckoutOptions(input.from, store, context, "✅ Continue seu pedido");
      return;
    }

    if (state === "cart") {
      // Aceita Entrega/Retirada direto no carrinho (mesmo padrão do checkout).
      const fulfillmentRaw = incoming.startsWith("fulfillment:") ? incoming.slice("fulfillment:".length) : normalized;
      const fromCart: Fulfillment | null =
        fulfillmentRaw === "delivery" || fulfillmentRaw === "entrega"
          ? "delivery"
          : fulfillmentRaw === "pickup" || fulfillmentRaw === "retirada"
            ? "pickup"
            : null;
      if (!fromCart) {
        await persist("awaiting_fulfillment", context);
        await resumeCurrentStep(input.from, store, "awaiting_fulfillment", context);
        return;
      }
      context.fulfillment = fromCart;
      if (fromCart === "delivery") {
        context.neighborhoodId = undefined;
        context.neighborhoodName = undefined;
        context.neighborhoodPage = null;
        context.addressText = undefined;
        context.addressDraft = undefined;
        await askDeliveryAddress(context);
        return;
      }
      await persist("awaiting_payment", context);
      await askPayment(input.from);
      return;
    }
  }

  if (state === "awaiting_fulfillment") {
    const fulfillment = (incoming.startsWith("fulfillment:") ? incoming.slice("fulfillment:".length) : normalized) as
      | Fulfillment
      | string;
    const resolved: Fulfillment | null =
      fulfillment === "delivery" || fulfillment === "entrega"
        ? "delivery"
        : fulfillment === "pickup" || fulfillment === "retirada"
          ? "pickup"
          : null;

    if (!resolved) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    context.fulfillment = resolved;
    if (resolved === "delivery") {
      context.neighborhoodId = undefined;
      context.neighborhoodName = undefined;
      context.neighborhoodPage = null;
      context.addressText = undefined;
      context.addressDraft = undefined;
      const knownAddress = isV2(store) ? context.aiHints?.address : undefined;
      if (knownAddress) {
        await applyTypedAddress(context, knownAddress);
        return;
      }
      await askDeliveryAddress(context);
      return;
    }

    await goToPayment(context);
    return;
  }

  if (state === "awaiting_saved_address") {
    const plain = normalize(input.text)
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const useOther = () => {
      context.addressText = undefined;
      context.addressDraft = undefined;
      context.neighborhoodId = undefined;
      context.neighborhoodName = undefined;
      context.neighborhoodPage = null;
    };

    if (incoming === SAVED_ADDRESS_YES || (!hasReply && SAVED_ADDRESS_YES_WORDS.test(plain))) {
      if (!context.addressText) {
        await persist("awaiting_address", context);
        await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
        return;
      }
      await goToPayment(context);
      return;
    }
    if (incoming === SAVED_ADDRESS_NO || (!hasReply && SAVED_ADDRESS_NO_WORDS.test(plain))) {
      useOther();
      await persist("awaiting_address", context);
      await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
      return;
    }
    if (store.pickupEnabled && wantsSwitchToPickup(incoming, normalized)) {
      useOther();
      context.fulfillment = "pickup";
      await goToPayment(context);
      return;
    }
    // Digitou um endereço novo direto, sem tocar em "Outro endereço".
    const typed = !hasReply ? resolveTypedAddress(input) : null;
    if (typed && looksLikeFullAddress(typed)) {
      useOther();
      await applyTypedAddress(context, typed);
      return;
    }
    await askSavedAddress(input.from, store, context);
    return;
  }

  // Sessões antigas em awaiting_neighborhood passam a usar o fluxo de endereço completo.
  if (state === "awaiting_neighborhood" || state === "awaiting_address") {
    if (input.location) {
      await sendText(
        input.from,
        [
          "😊 Obrigado pela localização!",
          "Para calcularmos a taxa certinho, *digite* o endereço completo (rua, número, bairro e referência).",
          "Não usamos o pin do mapa nesta etapa."
        ].join("\n")
      );
      await persist("awaiting_address", context);
      await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
      return;
    }

    if (wantsSwitchToPickup(incoming, normalized)) {
      if (!store.pickupEnabled) {
        await sendText(input.from, "No momento a retirada não está disponível.");
        await persist("awaiting_address", context);
        await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
        return;
      }
      context.fulfillment = "pickup";
      context.neighborhoodId = undefined;
      context.neighborhoodName = undefined;
      context.neighborhoodPage = null;
      context.addressText = undefined;
      context.addressDraft = undefined;
      await persist("awaiting_payment", context);
      await askPayment(input.from);
      return;
    }

    const zones = store.neighborhoods ?? [];

    // Desambiguação: cliente escolheu um bairro da lista.
    if (incoming.startsWith("nbh:")) {
      const zoneId = incoming.slice(4);
      const zone = zones.find(item => item.id === zoneId);
      if (!zone) {
        await sendText(input.from, "Não reconheci esse bairro. Envie o endereço completo de novo.");
        await persist("awaiting_address", context);
        await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
        return;
      }
      context.neighborhoodId = zone.id;
      context.neighborhoodName = zone.name;
      context.neighborhoodPage = null;
      if (!context.addressText) {
        await persist("awaiting_address", context);
        await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
        return;
      }
      if (isV2(store)) {
        await persist("awaiting_fee_confirm", context);
        await askFeeConfirm(input.from, store, context);
        return;
      }
      await sendText(input.from, `📍 Bairro *${zone.name}* · taxa ${formatBRL(zone.feeCents)}.`);
      await persist("awaiting_payment", context);
      await askPayment(input.from);
      return;
    }

    const address = resolveTypedAddress(input);
    if (!address || address.trim().length < (context.addressDraft ? 3 : 5)) {
      await sendText(
        input.from,
        "Digite o *endereço completo* (rua, número, bairro e referência). Não envie localização do celular."
      );
      await persist("awaiting_address", context);
      await askCompleteAddress(input.from, { pickupEnabled: store.pickupEnabled });
      return;
    }

    await applyTypedAddress(context, address);
    return;
  }

  if (state === "awaiting_change") {
    const totalCents = orderTotalCents(store, context);
    const change = parseChangeCents(input.text);
    if (change == null) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    if (change > 0 && change < totalCents) {
      await sendText(input.from, `O troco precisa ser pelo menos o total de *${formatBRL(totalCents)}*.`);
      await askChange(input.from, totalCents);
      return;
    }
    context.changeForCents = change;
    context.paymentMethod = "cash";
    if (!context.paymentMethodLabel) {
      context.paymentMethodLabel = "Dinheiro";
    }
    await askContactOrFinish();
    return;
  }

  if (state === "awaiting_payment") {
    const payment =
      (await resolvePaymentMethod(incoming, normalized)) ??
      (isV2(store) && !hasReply ? await resolvePaymentMethodLoose(input.text) : null);
    if (payment === "card_ambiguous") {
      const methods = await listPaymentMethods();
      const cardMethods = methods.filter(item => item.kind === "credit" || item.kind === "debit");
      if (!cardMethods.length) {
        await resumeCurrentStep(input.from, store, state, context);
        return;
      }
      await persist("awaiting_payment", context);
      await sendButtons(
        input.from,
        "Qual cartão?",
        cardMethods.slice(0, 3).map(item => ({
          id: `pay:${item.id}`,
          title: item.name.slice(0, 20)
        }))
      );
      return;
    }

    if (!payment || !context.fulfillment) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    context.paymentMethod = payment.kind;
    context.paymentMethodId = payment.id;
    context.paymentMethodLabel = payment.name;
    if (payment.kind === "cash") {
      const totalCents = orderTotalCents(store, context);
      await persist("awaiting_change", context);
      await askChange(input.from, totalCents);
      return;
    }

    context.changeForCents = undefined;
    await askContactOrFinish();
    return;
  }

  if (state === "awaiting_contact_name") {
    const name = clipContactName(input.text);
    if (!name || incoming.startsWith("pay:") || incoming.startsWith("fulfillment:")) {
      await askContactName(input.from);
      return;
    }
    context.contactName = name;
    const updated = await updateCustomerName(customer.id, name);
    if (updated) {
      customer.name = updated.name;
    } else {
      customer.name = name;
    }
    await finishOrder(input.from, store, customer, context, persist);
    return;
  }

  if (state === "awaiting_order_code") {
    const order = (await findOrderByCode(input.text.trim(), customer.id)) ?? (await findOrderByCode(input.text.trim()));
    if (!order) {
      await sendText(input.from, "Não achei esse código. Confira e envie de novo.");
      return;
    }
    await persist("welcome", context);
    await sendText(
      input.from,
      formatOrderStatusMessage(order, {
        allowCustomerCancel: store.allowCustomerCancel
      })
    );
    return;
  }

  if (orderActive) {
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  if (context.cart.length) {
    await persist("cart", context);
    await showCartPrompt(input.from, context, RESUME_HINT);
    return;
  }

  // Pedido em aberto: qualquer mensagem residual responde o status, sem Bem-vindo.
  if (await replyOpenOrderStatus(isCustomerAck(input.text, command))) {
    return;
  }

  // Agradecimento residual: não reinicia.
  if (!hasReply && isCustomerAck(input.text, command)) {
    await touchConversation(customer.id);
    return;
  }

  if (isV2(store)) {
    await startConversationV2(hasReply ? undefined : input.text);
    return;
  }
  await persist("welcome", context, { reopen: true });
  await showWelcome(input.from, store.name);
}
