import { applyAutoAccept } from "../lib/autoAcceptOrder.js";
import { closedStoreMessage, dayPeriodWish, isStoreOpen } from "../lib/businessHours.js";
import { formatBRL, formatReais } from "../lib/money.js";
import { sendButtons, sendList, sendText, sendTypingIndicator } from "../lib/whatsapp.js";
import { matchNeighborhoodQuery } from "./neighborhoodMatch.js";
import { NEW_ORDER_NO, NEW_ORDER_YES } from "../lib/orderNotify.js";
import {
  recordConversationOrder,
  findLatestOrder,
  createOrder,
  findOrderByCode,
  getConversation,
  getProduct,
  getStore,
  listAddons,
  listCrusts,
  listProducts,
  saveConversation,
  touchConversation,
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
  type Store
} from "../types.js";

const CANCEL_KEYS = ["cancelar", "sair"];
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
  const normalized =
    normalizedMaybe == null ? normalize(rawOrNormalized) : normalizedMaybe;

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
      (key) =>
        text === key ||
        text.startsWith(`${key} `) ||
        text.endsWith(` ${key}`) ||
        text.includes(` ${key} `),
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
    .replace(/\b(quero|queria|vou querer|pode ser|serao|sera|sao|de|unidades?|itens?|pizzas?|pedacos?|vezes)\b/g, " ")
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
}

function isBatchActive(context: ConversationContext) {
  return (
    Boolean(context.batchCategoryId) &&
    typeof context.batchRemaining === "number" &&
    context.batchRemaining > 0
  );
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

async function askCrusts(to: string, product: Product, crusts: Crust[]) {
  const visible = crustsForPizza(product, crusts).slice(0, 10);
  if (!visible.length) return false;
  await sendList(to, `*${product.name}*\n🧀 Escolha a borda.`, "Ver bordas", [
    {
      title: "Bordas",
      rows: visible.map(crust => ({
        id: `crust:${crust.id}`,
        title: crust.name.slice(0, 24),
        ...(crust.addsPrice && crust.price > 0 ? { description: `+ ${formatReais(crust.price)}` } : {})
      }))
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
 */
export async function resumeAfterHumanHandoff(input: {
  phone: string;
  customerId: string;
  state: ConversationState;
  context: ConversationContext;
}) {
  const store = await getStore();
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
      await showMenu(to, withHint("Escolha um item do cardápio:"), context);
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
            await showFlavorList(to, product, openGroup, drafts, context.flavorOffset ?? 0);
            return;
          }
          const shares =
            flavorShareLine(
              product.name,
              current.options.map(item => item.name)
            ) || current.options.map(item => item.name).join(" + ");
          const label = `*${openGroup.name}:*\n${shares}`;
          await sendButtons(to, withHint(label), [
            { id: "more_options", title: "Mais um" },
            { id: "done_options", title: "Pronto" }
          ]);
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
        await askQuantity(to, product, context.draftSelections ?? []);
        return;
      }
      await sendHintIfNeeded();
      await askCrusts(to, product, matching);
      return;
    }
    case "awaiting_addon": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      if (!product) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      await sendHintIfNeeded();
      await askAddons(to, product, context.draftSelections, context.addonOffset ?? 0);
      return;
    }
    case "awaiting_quantity": {
      const product = context.selectedProductId ? await getProduct(context.selectedProductId) : null;
      if (!product) {
        await showMenu(to, withHint("Escolha um item do cardápio:"), context);
        return;
      }
      await askQuantity(to, product, context.draftSelections ?? []);
      return;
    }
    case "awaiting_batch_count": {
      const categoryId = context.menuCategoryId ?? context.batchCategoryId;
      const categories = productCategories(await listProducts());
      const categoryName =
        categories.find((item) => item.id === categoryId)?.name ?? "Categoria";
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
    case "cart":
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
      // intro já inclui o título do carrinho em showCheckoutOptions — não duplicar.
      await showCheckoutOptions(to, store, context, hint || "✅ Continue seu pedido");
      return;
    case "awaiting_neighborhood":
      await sendHintIfNeeded();
      await askNeighborhoods(to, store, context);
      return;
    case "awaiting_address": {
      const zone = (store.neighborhoods ?? []).find(item => item.id === context.neighborhoodId) ?? null;
      await sendHintIfNeeded();
      await goToAddress(to, zone);
      return;
    }
    case "awaiting_payment":
      await askPayment(to, withHint("Como deseja pagar?"));
      return;
    case "awaiting_change":
      await askChange(to, orderTotalCents(store, context));
      return;
    case "awaiting_order_code":
      await sendText(to, "Me envie o código do pedido (ex.: A7K2).");
      return;
    case "awaiting_new_order":
      await askNewOrderAfterHandoff(to);
      return;
    default:
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
  if (!isStoreOpen(store.businessHours, store.timezone)) {
    if (input.waMessageId) {
      await sendTypingIndicator(input.waMessageId).catch(() => undefined);
    }
    await sendText(input.from, closedStoreMessage(store.name, store.businessHours));
    return;
  }
  const customer = await upsertCustomer(input.from, input.name, input.avatarUrl);
  const existing = await getConversation(customer.id);
  if (existing?.handoffMode === "human") {
    await touchConversation(customer.id);
    return;
  }
  const state: ConversationState = existing?.state ?? "welcome";
  const context = existing?.context ?? emptyContext();

  // Fora do pedido: figurinha/áudio/mídia não reinicia atendimento.
  if (!isOrderInProgress(state) && state !== "awaiting_order_code") {
    await touchConversation(customer.id);
    return;
  }

  if (input.waMessageId) {
    await sendTypingIndicator(input.waMessageId).catch(() => undefined);
  }
  await resumeCurrentStep(input.from, store, state, context);
}

async function askItemNote(to: string, item: CartItem) {
  const { lines } = itemHeading(item, { withQuantity: true });
  await sendButtons(
    to,
    ["📝 Observação deste item?", ...lines, "Ex.: sem cebola. Ou *Pular*."].filter(Boolean).join("\n"),
    [{ id: "skip_note", title: "Pular" }]
  );
}

async function askOrderNote(to: string) {
  await sendButtons(to, "📝 Observação para *entrega*?\nEx.: interfone 12.\nSe não quiser, toque em *Pular*.", [
    { id: "skip_note", title: "Pular" }
  ]);
}

async function askNeighborhoods(to: string, store: Store, _context?: ConversationContext) {
  const zones = store.neighborhoods ?? [];
  if (!zones.length) {
    await sendText(to, "Nenhum bairro cadastrado. Digite o endereço completo.");
    return;
  }
  await sendText(to, ["📍 Qual o *bairro* da entrega?", "Digite o bairro corretamente", ,].join("\n"));
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

async function goToAddress(to: string, zone?: DeliveryNeighborhood | null) {
  const intro = [
    zone ? `📍 Bairro *${zone.name}* · taxa ${formatBRL(zone.feeCents)}.` : null,
    "🏠 Qual o endereço completo da entrega?",
    "*Pode digitar o endereço*.",
    "*Por favor, informe também a referência da entrega*."
  ]
    .filter(Boolean)
    .join("\n");
  await sendText(to, intro);
}

function formatLocation(location: { latitude: number; longitude: number; name?: string; address?: string }) {
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
}): string | null {
  if (input.location) return formatLocation(input.location);
  const text = input.text.trim();
  return text || null;
}

const PAYMENT_ROWS = [
  { id: "pay:pix", title: "Pix na Entrega/Retirada" },
  { id: "pay:cash", title: "Dinheiro" },
  { id: "pay:credit", title: "Cartão crédito" },
  { id: "pay:debit", title: "Cartão débito" }
];

async function askPayment(to: string, intro = "💳 Como deseja pagar?") {
  await sendList(to, intro, "Ver opções", [{ title: "Pagamento", rows: PAYMENT_ROWS }]);
}

function parsePayment(incoming: string, normalized: string): PaymentMethod | "card_ambiguous" | null {
  const raw = incoming.startsWith("pay:") ? incoming.slice(4) : normalized;
  const value = normalize(raw.replace(/_/g, " "));
  if (value === "pix" || value.startsWith("pix ")) return "pix";
  if (value === "cash" || value === "dinheiro") return "cash";
  if (value === "credit" || value === "credito" || value === "cartao credito" || value === "cartao de credito") {
    return "credit";
  }
  if (value === "debit" || value === "debito" || value === "cartao debito" || value === "cartao de debito") {
    return "debit";
  }
  if (value === "card" || value === "cartao") return "card_ambiguous";
  return null;
}

function paymentLabel(method: PaymentMethod) {
  if (method === "pix") return "Pix na Entrega/Retirada";
  if (method === "cash") return "Dinheiro";
  if (method === "credit") return "Cartão crédito";
  if (method === "debit") return "Cartão débito";
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
      "Posso te ajudar com o cardápio, um novo pedido ou o status de um pedido. 🍕",
      "Caso queira encerrar a conversa sem finalizar o pedido, digite *Sair*."
    ].join("\n"),
    [
      { id: "menu", title: "Ver cardápio" },
      { id: "order", title: "Fazer pedido" },
      { id: "status", title: "Status do pedido" }
    ]
  );
}

const WA_LIST_MAX_ROWS = 10;

function resetMenuBrowse(context: ConversationContext) {
  context.menuCategoryId = null;
  context.menuOffset = 0;
}

function productCategories(products: Product[]) {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const product of products) {
    const id = product.categoryId || product.categoryName || "cardapio";
    const name = product.categoryName?.trim() || "Cardápio";
    const current = map.get(id);
    if (current) current.count += 1;
    else map.set(id, { id, name, count: 1 });
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

async function showMenuCategories(
  to: string,
  intro: string,
  categories: { id: string; name: string; count: number }[],
  offset: number
) {
  const reserveMore = offset + (WA_LIST_MAX_ROWS - 1) < categories.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - reserveMore;
  const page = categories.slice(offset, offset + pageSize);
  const rows: { id: string; title: string; description?: string }[] = page.map(category => ({
    id: `menucat:${category.id}`,
    title: category.name.slice(0, 24),
  }));
  if (reserveMore) {
    rows.push({
      id: "menu:more_cats",
      title: "Mais categorias",
      description: "Ver próximas"
    });
  }
  await sendList(to, [intro, "📂 Escolha uma *categoria*."].join("\n"), "Categorias", [{ title: "Categorias", rows }]);
}

async function showMenuProducts(
  to: string,
  intro: string,
  products: Product[],
  opts: { categoryName?: string | null; offset: number; canGoBack: boolean }
) {
  const reserveBack = opts.canGoBack ? 1 : 0;
  const tentativeMore = opts.offset + (WA_LIST_MAX_ROWS - reserveBack - 1) < products.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - reserveBack - tentativeMore;
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
  if (opts.canGoBack) {
    rows.push({
      id: "menu:back_cats",
      title: "← Categorias",
      description: "Voltar"
    });
  }

  const heading = [intro, opts.categoryName ? `📂 *${opts.categoryName}*` : null].filter(Boolean).join("\n");

  await sendList(to, heading, "Ver itens", [
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
  store?: Store,
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

  // Uma categoria só: se estiver no lote, pergunta quantas antes dos itens.
  if (
    !context.menuCategoryId &&
    categories.length === 1 &&
    persist &&
    !isBatchActive(context) &&
    categoryUsesBatch(resolvedStore, categories[0].id)
  ) {
    context.menuCategoryId = categories[0].id;
    context.menuOffset = 0;
    await persist("awaiting_batch_count", context);
    await askBatchCount(to, categories[0].name);
    return;
  }

  // Categoria já escolhida → lista produtos dela.
  if (context.menuCategoryId) {
    const inCategory = products.filter(
      item => (item.categoryId || item.categoryName || "cardapio") === context.menuCategoryId
    );
    const categoryName =
      inCategory[0]?.categoryName ?? categories.find(item => item.id === context.menuCategoryId)?.name ?? "Cardápio";
    await showMenuProducts(to, intro, inCategory, {
      categoryName,
      offset,
      canGoBack: categories.length > 1 && !isBatchActive(context)
    });
    return;
  }

  // Muitos itens e várias categorias → escolhe categoria primeiro.
  if (categories.length > 1 && products.length > WA_LIST_MAX_ROWS) {
    await showMenuCategories(to, intro, categories, offset);
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
  return askGroupOptions(to, product, group, context.draftSelections ?? []);
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
  offset = 0
) {
  const current = drafts.find(item => item.groupId === group.id);
  const picked = current?.options.map(option => option.id) ?? [];
  const pickedNames = current?.options.map(option => option.name) ?? [];
  const remaining = await pizzaFlavorChoices(product.pizzaKind, [product.id, ...picked]);
  if (!remaining.length) return true;

  const needsDone = picked.length >= 1;
  const reserveDone = needsDone ? 1 : 0;
  const tentativeMore = offset + (WA_LIST_MAX_ROWS - reserveDone - 1) < remaining.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - reserveDone - tentativeMore;
  const page = remaining.slice(offset, offset + pageSize);
  const hasMore = offset + page.length < remaining.length;

  const rows: { id: string; title: string; description?: string }[] = page.map(pizza => {
    const detail = pizza.description?.trim();
    const description =
      detail && detail.toLowerCase() !== "null" ? detail.slice(0, 72) : undefined;
    return {
      id: `flavor:${pizza.id}`,
      title: pizza.name.slice(0, 24),
      ...(description ? { description } : {}),
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

  await sendList(to, groupPrompt(product, group, picked, pickedNames), "Escolha o sabor", [
    {
      title: "Sabores",
      rows: rows.slice(0, WA_LIST_MAX_ROWS)
    }
  ]);
  return false;
}

async function askGroupOptions(to: string, product: Product, group: ProductOptionGroup, drafts: CartSelection[]) {
  const current = drafts.find(item => item.groupId === group.id);
  const picked = current?.options.map(option => option.id) ?? [];
  const pickedNames = current?.options.map(option => option.name) ?? [];

  if (usesCatalogFlavors(group)) {
    // Não lista a própria pizza do cardápio nem sabores já marcados nesta montagem.
    const remaining = await pizzaFlavorChoices(product.pizzaKind, [product.id, ...picked]);
    if (!remaining.length) return true;

    // Já tem sabor extra: abre a lista direto (fluxo "Mais um").
    if (picked.length > 0) {
      return showFlavorList(to, product, group, drafts, 0);
    }

    // Primeira decisão: botões lado a lado — "Escolher sabor" por último (mais clicado).
    await sendButtons(to, groupPrompt(product, group, picked, pickedNames), [
      { id: "skip_group", title: "Só este sabor" },
      { id: "choose_flavor", title: "Escolher sabor" }
    ]);
    return false;
  }

  const remaining = group.options.filter(option => !picked.includes(option.id));
  if (!remaining.length) return true;

  const pageSize = WA_LIST_MAX_ROWS;
  await sendList(to, groupPrompt(product, group, picked, pickedNames), "Escolher", [
    {
      title: group.name.slice(0, 24),
      rows: remaining.slice(0, pageSize).map(option => ({
        id: `opt:${option.id}`,
        title: option.name.slice(0, 24),
        ...(group.maxSelect > 1 || group.exclusiveSet?.trim()
          ? {}
          : { description: optionDescription(option.extraPrice) })
      }))
    }
  ]);
  if (!group.required && picked.length === 0) {
    await sendButtons(to, "✨ Esta etapa é opcional.", [{ id: "skip_group", title: "Pular" }]);
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

async function askQuantity(to: string, product: Product, extras: CartSelection[]) {
  const variant = assembledName(product, extras);
  const price = unitPriceCents(product, extras);
  const sep = " — ";
  const sepAt = variant.indexOf(sep);
  const title = sepAt >= 0 ? variant.slice(0, sepAt).trim() : variant;
  const detail = sepAt >= 0 ? variant.slice(sepAt + sep.length).trim() : "";
  const heading = [`*${title}*`, detail || null, crustLabel(extras), addonLabel(extras), formatReais(price / 100)]
    .filter(Boolean)
    .join("\n");
  await sendButtons(to, `${heading}\n🔢 Quantas unidades?\nOu digite um número de 1 a 50.`, [
    { id: "qty:1", title: "1" },
    { id: "qty:2", title: "2" },
    { id: "qty:3", title: "3" }
  ]);
}

async function askBatchCount(to: string, categoryName: string) {
  await sendButtons(
    to,
    `*${categoryName}*\n🔢 Você vai querer quantas?\nOu digite um número.`,
    [
      { id: "qty:1", title: "1" },
      { id: "qty:2", title: "2" },
      { id: "qty:3", title: "3" },
    ],
  );
}

async function askAddons(to: string, product: Product, drafts?: CartSelection[], offset = 0) {
  const remaining = await remainingAddons(product, drafts);
  if (!remaining.length) return true;

  const picked = draftAddon(drafts)?.options.map(addonOptionLabel) ?? [];
  const prompt = [
    `*${product.name}*`,
    picked.length ? `🧀 Adicionais: ${picked.join(", ")}` : "🧀 Escolha um adicional",
    picked.length ? "Quer outro? Escolha ou toque em *Pronto* na lista." : ""
  ]
    .filter(Boolean)
    .join("\n");

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

  const tentativeMore = offset + (WA_LIST_MAX_ROWS - 2) < remaining.length ? 1 : 0;
  const pageSize = WA_LIST_MAX_ROWS - 1 - tentativeMore;
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
  rows.push(footer);

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

  commitDraftToCart(context);
  await finishItemOrContinueBatch(to, store, context, persist);
}

/** Após gravar um item: se ainda há lote da categoria, deixa escolher o próximo; senão vai ao carrinho. */
async function finishItemOrContinueBatch(
  to: string,
  store: Store,
  context: ConversationContext,
  persist: (state: ConversationState, nextContext?: ConversationContext) => Promise<unknown>
) {
  if (isBatchActive(context)) {
    context.batchRemaining = (context.batchRemaining ?? 1) - 1;
    if ((context.batchRemaining ?? 0) > 0) {
      const total = context.batchTotal ?? context.batchRemaining + 1;
      const ordinal = total - (context.batchRemaining ?? 0) + 1;
      context.selectedProductId = undefined;
      context.draftSelections = [];
      context.optionGroupIndex = undefined;
      context.addonOffset = 0;
      context.flavorOffset = 0;
      context.menuCategoryId = context.batchCategoryId ?? context.menuCategoryId ?? null;
      context.menuOffset = 0;
      await persist("awaiting_product", context);
      await showMenu(
        to,
        `✅ Item adicionado!\n📋 Escolha o item da *${ordinal}ª* de *${total}*:`,
        context,
        persist,
        store,
      );
      return;
    }
    clearBatch(context);
  }

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
      await askCrusts(to, product, crusts);
      return;
    }
  }
  if ((await productHasAddons(product)) && !addonStepDone(context.draftSelections)) {
    context.addonOffset = 0;
    await persist("awaiting_addon", context);
    await askAddons(to, product, context.draftSelections, 0);
    return;
  }
  if (product.quantityEnabled) {
    await persist("awaiting_quantity", context);
    await askQuantity(to, product, context.draftSelections ?? []);
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
  if (isCustomizable(product)) {
    await persist("awaiting_option", context);
    await askAssembly(to, product, context);
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
    await sendText(to, "Escolha Pix, dinheiro, cartão crédito ou débito.");
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
  const changeForCents = context.changeForCents;

  const order = await createOrder({
    customer,
    fulfillment: context.fulfillment,
    paymentMethod: context.paymentMethod,
    changeForCents: context.paymentMethod === "cash" ? (context.changeForCents ?? 0) : null,
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
      `💳 Pagamento: ${paymentLabel(paymentMethod)}`,
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

export async function handleIncomingMessage(input: {
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
}) {
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

  const persist = (nextState: ConversationState, nextContext = context, options?: SaveConversationOptions) =>
    saveConversation(customer, nextState, nextContext, options);

  async function replyOpenOrderStatus(thanks = false) {
    const latest = await findLatestOrder(customer.id);
    if (!latest || !isOpenOrderStatus(latest.status)) return false;
    // Não reabre Ativas: só responde o status do pedido em andamento.
    await persist("welcome", emptyContext());
    await sendText(
      input.from,
      formatOrderStatusMessage(latest, {
        thanks,
        allowCustomerCancel: store.allowCustomerCancel
      })
    );
    return true;
  }

  // Loja fechada: só informa horário — sem cardápio, status, botões ou qualquer fluxo.
  if (!isStoreOpen(store.businessHours, store.timezone)) {
    await sendText(input.from, closedStoreMessage(store.name, store.businessHours));
    return;
  }

  // Cancelamento do pedido pelo cliente (frase exata), se a loja permitir.
  if (store.allowCustomerCancel && command === "cancelar pedido") {
    const latest = await findLatestOrder(customer.id);
    if (latest && canCustomerCancelStatus(latest.status)) {
      await updateOrderStatus(latest.id, "cancelled", "Cliente WhatsApp");
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

  if (CANCEL_KEYS.includes(command)) {
    await persist("welcome", emptyContext(), { close: true });
    await sendText(
      input.from,
      "👋 Atendimento encerrado. Obrigado pelo contato! Quando quiser pedir de novo, é só mandar uma mensagem."
    );
    return;
  }

  const idleMinutes = store.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (isConversationIdle(existing?.lastMessageAt, idleMinutes)) {
    // Pedido em aberto (Aceito/Preparo/…): não reinicia o menu — só informa o status.
    if (await replyOpenOrderStatus(isCustomerAck(input.text, command))) return;
    // Agradecimento / emoji após ociosidade: não reinicia o cardápio.
    if (!input.replyId && isCustomerAck(input.text, command)) {
      await touchConversation(customer.id);
      return;
    }
    // Bem-vindo já conta como conversa ativa no painel.
    await persist("welcome", emptyContext(), { reopen: true });
    await showWelcome(input.from, store.name);
    return;
  }

  const orderActive = isOrderInProgress(state);
  const hasReply = Boolean(input.replyId);

  // Agradecimento / emoji fora do fluxo: não inicia novo pedido (ex.: após despedida).
  // Não engole awaiting_new_order (Sim/Não) nem código de pedido.
  if (
    !orderActive &&
    !hasReply &&
    state !== "awaiting_new_order" &&
    state !== "awaiting_order_code" &&
    isCustomerAck(input.text, command)
  ) {
    if (await replyOpenOrderStatus(true)) return;
    await touchConversation(customer.id);
    return;
  }

  // Localização só vale na etapa de endereço.
  if (orderActive && input.location && state !== "awaiting_address") {
    await resumeCurrentStep(input.from, store, state, context);
    return;
  }

  // Atalhos globais (menu/status/pedido) não interrompem pedido em andamento.
  // No checkout unificado, "Adicionar mais" usa id "order" em cart e awaiting_fulfillment.
  const cartAddMore = (state === "cart" || state === "awaiting_fulfillment") && incoming === "order";
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
    commitDraftToCart(context);
    await finishItemOrContinueBatch(input.from, store, context, persist);
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
      store,
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

  // Após o pedido (conversa em welcome/fechada), texto livre não reinicia o menu
  // enquanto houver pedido em aberto — responde o status (com "Por nada" se for ack).
  if (!orderActive && !hasReply && (await replyOpenOrderStatus(isCustomerAck(input.text, command)))) {
    return;
  }

  // Fora do pedido e sem pedido em aberto, texto livre volta ao menu inicial.
  if (state === "welcome" && !hasReply) {
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
      const finished = await askGroupOptions(input.from, product, group, drafts);
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
      const finished = await showFlavorList(input.from, product, group, drafts, context.flavorOffset ?? 0);
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
      await showFlavorList(input.from, product, group, drafts, context.flavorOffset);
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
        // Sabores do cardápio: próxima lista direto (Pronto fica na própria lista).
        if (usesCatalogFlavors(group) && canAddMore) {
          context.flavorOffset = 0;
          await persist("awaiting_option", context);
          await showFlavorList(input.from, product, group, drafts, 0);
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
          label,
          canAddMore
            ? [
                { id: "more_options", title: "Mais um" },
                { id: "done_options", title: "Pronto" }
              ]
            : [{ id: "done_options", title: "Pronto" }]
        );
        return;
      }
      await askGroupOptions(input.from, product, group, drafts);
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
      incoming === "skip_addon" ||
      incoming === "more_addons" ||
      incoming === "done_addons" ||
      incoming === "more_options" ||
      incoming === "done_options";

    if (!addonAction) {
      await persist("awaiting_addon", context);
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }

    if (incoming === "more_addons" || incoming === "more_options") {
      context.addonOffset = (context.addonOffset ?? 0) + 8;
      await persist("awaiting_addon", context);
      const finished = await askAddons(input.from, product, drafts, context.addonOffset);
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
    await askAddons(input.from, product, context.draftSelections, 0);
    return;
  }

  if (state === "awaiting_product") {
    if (incoming.startsWith("menucat:")) {
      const categoryId = incoming.slice("menucat:".length);
      context.menuCategoryId = categoryId;
      context.menuOffset = 0;
      if (!isBatchActive(context) && categoryUsesBatch(store, categoryId)) {
        clearBatch(context);
        const categories = productCategories(await listProducts());
        const categoryName =
          categories.find((item) => item.id === categoryId)?.name ?? "Categoria";
        await persist("awaiting_batch_count", context);
        await askBatchCount(input.from, categoryName);
        return;
      }
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha um item:", context, persist, store);
      return;
    }
    if (incoming === "menu:more_cats") {
      context.menuOffset = (context.menuOffset ?? 0) + 9;
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha uma categoria:", context, persist, store);
      return;
    }
    if (incoming === "menu:more_items") {
      context.menuOffset = (context.menuOffset ?? 0) + 8;
      await persist("awaiting_product", context);
      await showMenu(input.from, "📋 Escolha um item:", context, persist, store);
      return;
    }
    if (incoming === "menu:back_cats") {
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

  if (state === "awaiting_batch_count") {
    const quantity = parseQuantity(incoming);
    const categoryId = context.menuCategoryId ?? context.batchCategoryId ?? null;
    const categories = productCategories(await listProducts());
    const categoryName =
      categories.find((item) => item.id === categoryId)?.name ?? "Categoria";

    if (!categoryId || quantity == null) {
      await sendText(
        input.from,
        "Informe um número de *1 a 50* (pode digitar por extenso, ex.: três).",
      );
      await askBatchCount(input.from, categoryName);
      return;
    }

    context.batchCategoryId = categoryId;
    context.menuCategoryId = categoryId;
    context.batchRemaining = quantity;
    context.batchTotal = quantity;
    context.batchProductId = undefined;
    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = 0;
    context.addonOffset = 0;
    context.flavorOffset = 0;
    context.menuOffset = 0;
    await persist("awaiting_product", context);
    await showMenu(
      input.from,
      `📋 Escolha o item da *1ª* de *${quantity}*:`,
      context,
      persist,
      store,
    );
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

    commitDraftToCart(context);
    await finishItemOrContinueBatch(input.from, store, context, persist);
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

  if (state === "cart" || state === "awaiting_fulfillment") {
    if (!context.cart.length) {
      resetMenuBrowse(context);
      await persist("awaiting_product", context);
      await showMenu(input.from, "Seu carrinho está vazio. Escolha um item:", context, persist, store);
      return;
    }
    if (incoming === "order" || normalized === "adicionar mais" || normalized === "adicionar mais itens") {
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
        const zones = store.neighborhoods ?? [];
        if (zones.length) {
          context.neighborhoodId = undefined;
          context.neighborhoodName = undefined;
          context.neighborhoodPage = null;
          await persist("awaiting_neighborhood", context);
          await askNeighborhoods(input.from, store, context);
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
      const zones = store.neighborhoods ?? [];
      if (zones.length) {
        context.neighborhoodId = undefined;
        context.neighborhoodName = undefined;
        context.neighborhoodPage = null;
        await persist("awaiting_neighborhood", context);
        await askNeighborhoods(input.from, store, context);
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
    const zones = store.neighborhoods ?? [];
    const query = (input.text || incoming || "").trim();
    if (!query || query.length < 2) {
      await sendText(input.from, "Digite o nome do bairro com pelo menos 2 letras.");
      await askNeighborhoods(input.from, store, context);
      return;
    }

    const result = matchNeighborhoodQuery(query, zones);
    if (result.status === "none") {
      await sendText(
        input.from,
        [
          "😕 Não encontrei esse bairro na nossa área de entrega.",
          "Confira a escrita e digite de novo (ex.: *Jardim América* ou *Jd América*)."
        ].join("\n")
      );
      await askNeighborhoods(input.from, store, context);
      return;
    }

    if (result.status === "ambiguous") {
      await persist("awaiting_neighborhood", context);
      await askNeighborhoodAmbiguous(input.from, result.matches);
      return;
    }

    const zone = result.match.zone;
    context.neighborhoodId = zone.id;
    context.neighborhoodName = zone.name;
    context.neighborhoodPage = null;
    await persist("awaiting_address", context);
    await goToAddress(input.from, zone);
    return;
  }

  if (state === "awaiting_address") {
    const address = resolveAddress(input);
    if (!address) {
      await resumeCurrentStep(input.from, store, state, context);
      return;
    }
    context.addressText = address;
    // if (ORDER_NOTE_STEP_ENABLED) {
    //   await persist("awaiting_order_note", context);
    //   await askOrderNote(input.from);
    //   return;
    // }
    await persist("awaiting_payment", context);
    await askPayment(input.from);
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
    await finishOrder(input.from, store, customer, context, persist);
    return;
  }

  if (state === "awaiting_payment") {
    const payment = parsePayment(incoming, normalized);
    if (payment === "card_ambiguous") {
      await persist("awaiting_payment", context);
      await sendButtons(input.from, "Qual cartão?", [
        { id: "pay:credit", title: "Crédito" },
        { id: "pay:debit", title: "Débito" }
      ]);
      return;
    }

    if (!payment || !context.fulfillment) {
      await resumeCurrentStep(input.from, store, state, context);
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

  await persist("welcome", context, { reopen: true });
  await showWelcome(input.from, store.name);
}
