import { formatBRL, formatReais } from "../lib/money.js";
import { sendButtons, sendList, sendText } from "../lib/whatsapp.js";
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
import { describeOrderStatus } from "./status.js";
import { resolveDeliveryFee } from "./deliveryFee.js";
import {
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
  Fulfillment,
  PaymentMethod,
  Product,
  ProductOptionGroup,
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

function renderCart(context: ConversationContext) {
  if (!context.cart.length) return "Seu carrinho está vazio.";
  const lines = context.cart.flatMap((item) => {
    const row = `• ${item.quantity}x ${item.name} — ${formatBRL(item.quantity * item.unitPriceCents)}`;
    return item.notes?.trim() ? [row, `  Obs.: ${item.notes.trim()}`] : [row];
  });
  return `${lines.join("\n")}\n\nSubtotal: ${formatBRL(cartTotal(context))}`;
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

async function showCartAfterAdd(to: string, context: ConversationContext, added: CartItem) {
  await sendButtons(
    to,
    `${added.quantity}x ${added.name} adicionado.\n\n${renderCart(context)}`,
    [
      { id: "order", title: "Adicionar mais" },
      { id: "checkout", title: "Fechar pedido" },
      { id: "clear_cart", title: "Limpar carrinho" },
    ],
  );
}

async function askItemNote(to: string, itemName: string) {
  await sendButtons(
    to,
    `Observação para *${itemName}*?\nEx.: sem cebola, bem assada.\nSe não quiser, toque em *Pular*.`,
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
  const name = assembledName(product, extras);
  const price = unitPriceCents(product, extras);
  await sendButtons(
    to,
    `*${name}*\n${formatReais(price / 100)}\nQuantas unidades?\nOu digite um número de 1 a 20.`,
    [
      { id: "qty:1", title: "1" },
      { id: "qty:2", title: "2" },
      { id: "qty:3", title: "3" },
    ],
  );
}

export async function handleIncomingMessage(input: {
  from: string;
  name?: string;
  text: string;
  replyId?: string;
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
      await askItemNote(input.from, context.draftItem.name);
      return;
    }
    const added = context.draftItem;
    added.notes = notes;
    commitDraftToCart(context);
    await persist("cart", context);
    await showCartAfterAdd(input.from, context, added);
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
      await sendText(
        input.from,
        `Seu último pedido *#${latest.code}* está *${describeOrderStatus(latest.status)}*.\nTotal: ${formatBRL(latest.totalCents)}.`,
      );
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

    if (isCustomizable(product)) {
      await persist("awaiting_option", context);
      await askAssembly(input.from, product, context);
      return;
    }

    await persist("awaiting_quantity", context);
    await askQuantity(input.from, product, []);
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
      quantity,
      unitPriceCents: unitPriceCents(product, extras),
      extras,
    };
    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = undefined;

    if (product.notesEnabled) {
      await persist("awaiting_item_note", context);
      await askItemNote(input.from, context.draftItem.name);
      return;
    }

    const added = commitDraftToCart(context);
    await persist("cart", context);
    if (added) await showCartAfterAdd(input.from, context, added);
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
      await persist("awaiting_address", context);
      await sendText(input.from, "Qual o endereço completo da entrega?");
      return;
    }

    await persist("awaiting_payment", context);
    await sendButtons(input.from, "Como deseja pagar?", [
      { id: "pay:pix", title: "Pix" },
      { id: "pay:cash", title: "Dinheiro" },
      { id: "pay:card", title: "Cartão" },
    ]);
    return;
  }

  if (state === "awaiting_address") {
    context.addressText = input.text.trim();
    await persist("awaiting_payment", context);
    await sendButtons(input.from, "Endereço anotado. Como deseja pagar?", [
      { id: "pay:pix", title: "Pix" },
      { id: "pay:cash", title: "Dinheiro" },
      { id: "pay:card", title: "Cartão" },
    ]);
    return;
  }

  if (state === "awaiting_payment" || incoming.startsWith("pay:")) {
    const raw = incoming.startsWith("pay:") ? incoming.slice(4) : normalized;
    const payment: PaymentMethod | null =
      raw === "pix" ? "pix" : raw === "cash" || raw === "dinheiro" ? "cash" : raw === "card" || raw === "cartao" ? "card" : null;

    if (!payment || !context.fulfillment) {
      await sendText(input.from, "Escolha Pix, dinheiro ou cartão.");
      return;
    }

    const deliveryFee = resolveDeliveryFee(
      context.fulfillment === "delivery" ? context.addressText : undefined,
      store,
    );
    const order = await createOrder({
      customer,
      fulfillment: context.fulfillment,
      paymentMethod: payment,
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
    await sendText(
      input.from,
      [
        `Pedido *#${order.code}* confirmado!`,
        renderCart(context),
        feeLine,
        `Total: *${formatBRL(order.totalCents)}*`,
        context.addressText ? `Entrega: ${context.addressText}` : "",
        context.orderNotes ? `Obs. do pedido: ${context.orderNotes}` : "",
        "Assim que o status mudar, eu te aviso por aqui.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
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
    await sendText(
      input.from,
      `Pedido *#${order.code}*: *${describeOrderStatus(order.status)}*.\nTotal: ${formatBRL(order.totalCents)}.`,
    );
    return;
  }

  await persist("welcome", context);
  await showWelcome(input.from, store.name);
}
