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
import {
  assembledName,
  groupPrompt,
  isCustomizable,
  nextAssembly,
  optionDescription,
  selectionKey,
  startingPrice,
  unitPriceCents,
  variantPrompt,
} from "./assemble.js";
import type {
  CartSelection,
  ConversationContext,
  ConversationState,
  Fulfillment,
  PaymentMethod,
  Product,
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
  const lines = context.cart.map(
    (item) =>
      `• ${item.quantity}x ${item.name} — ${formatBRL(item.quantity * item.unitPriceCents)}`,
  );
  return `${lines.join("\n")}\n\nSubtotal: ${formatBRL(cartTotal(context))}`;
}

async function showWelcome(to: string, storeName: string) {
  await sendButtons(
    to,
    `Olá! Bem-vindo à *${storeName}*.\nPosso te ajudar com o cardápio, um novo pedido ou o status de um pedido.`,
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
      description: `${
        product.customizable
          ? `a partir de ${formatReais(startingPrice(product))}`
          : formatReais(product.price)
      }${product.customizable ? " · montável" : ""}${
        product.description ? ` · ${product.description}` : ""
      }`,
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
        })),
      },
    ]);
    return false;
  }

  const group = next.group;
  const current = context.draftSelections?.find((item) => item.groupId === group.id);
  const picked = current?.options.map((option) => option.id) ?? [];
  const remaining = group.options.filter((option) => !picked.includes(option.id));
  if (!remaining.length) return true;

  await sendList(to, groupPrompt(product, group, picked), "Escolher", [
    {
      title: group.name.slice(0, 24),
      rows: remaining.slice(0, 10).map((option) => ({
        id: `opt:${option.id}`,
        title: option.name.slice(0, 24),
        description: optionDescription(option.extraPrice),
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

async function askQuantity(to: string, product: Product, extras: CartSelection[]) {
  const name = assembledName(product, extras);
  const price = unitPriceCents(product, extras);
  await sendButtons(
    to,
    `*${name}*\n${formatReais(price / 100)}\nQuantas unidades?`,
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
    await showWelcome(input.from, store.name);
    return;
  }

  const idleMinutes = store.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  if (isConversationIdle(existing?.lastMessageAt, idleMinutes)) {
    await persist("welcome", emptyContext());
    await showWelcome(input.from, store.name);
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
      await askAssembly(input.from, product, context);
    };

    if (pending.type === "variant") {
      const variantId = incoming.startsWith("var:")
        ? incoming.slice(4)
        : pending.groups.find((group) => normalize(group.name) === normalized)?.id;
      const group = pending.groups.find((item) => item.id === variantId);
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
          options: [],
        });
      }
      await persist("awaiting_option", context);
      await askAssembly(input.from, product, context);
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

      if (
        incoming === "skip_group" ||
        normalized === "pular" ||
        incoming === "done_options" ||
        normalized === "pronto"
      ) {
        if (group.required && current.options.length < Math.max(1, group.minSelect)) {
          await sendText(
            input.from,
            `Escolha pelo menos ${Math.max(1, group.minSelect)} em *${group.name}*.`,
          );
          await askAssembly(input.from, product, context);
          return;
        }
        await goNext();
        return;
      }

      if (incoming === "more_options") {
        await persist("awaiting_option", context);
        await askAssembly(input.from, product, context);
        return;
      }

      if (incoming.startsWith("opt:")) {
        const option = group.options.find((item) => item.id === incoming.slice(4));
        if (!option) {
          await sendText(input.from, "Não encontrei essa opção.");
          await askAssembly(input.from, product, context);
          return;
        }
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
          await sendButtons(
            input.from,
            `*${group.name}:* ${current.options.map((item) => item.name).join(", ")}`,
            [
              { id: "more_options", title: "Mais um" },
              { id: "done_options", title: "Pronto" },
            ],
          );
          return;
        }
        await askAssembly(input.from, product, context);
        return;
      }

      await askAssembly(input.from, product, context);
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
    const raw = incoming.startsWith("qty:") ? incoming.slice(4) : incoming;
    const quantity = Number.parseInt(raw, 10);
    const product = context.selectedProductId
      ? await getProduct(context.selectedProductId)
      : null;

    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      await sendText(input.from, "Envie um número de 1 a 20.");
      return;
    }

    const extras = context.draftSelections ?? [];
    const nextItem = {
      productId: product.id,
      name: assembledName(product, extras),
      quantity,
      unitPriceCents: unitPriceCents(product, extras),
      extras,
    };
    const already = context.cart.find(
      (item) => selectionKey(item) === selectionKey(nextItem),
    );
    if (already) already.quantity += quantity;
    else context.cart.push(nextItem);

    context.selectedProductId = undefined;
    context.draftSelections = [];
    context.optionGroupIndex = undefined;
    await persist("cart", context);
    await sendButtons(
      input.from,
      `${quantity}x ${nextItem.name} adicionado.\n\n${renderCart(context)}`,
      [
        { id: "order", title: "Adicionar mais" },
        { id: "checkout", title: "Fechar pedido" },
        { id: "clear_cart", title: "Limpar carrinho" },
      ],
    );
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
      await persist("awaiting_fulfillment", context);
      const buttons = [];
      if (store.deliveryEnabled) buttons.push({ id: "fulfillment:delivery", title: "Entrega" });
      if (store.pickupEnabled) buttons.push({ id: "fulfillment:pickup", title: "Retirada" });
      await sendButtons(
        input.from,
        `${renderCart(context)}\n\nComo você prefere receber?`,
        buttons,
      );
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

    const deliveryFee =
      context.fulfillment === "delivery" ? store.deliveryFeeCents : 0;
    const order = await createOrder({
      customer,
      fulfillment: context.fulfillment,
      paymentMethod: payment,
      addressText: context.addressText,
      deliveryFeeCents: deliveryFee,
      items: context.cart,
    });

    await persist("welcome", emptyContext());
    await sendText(
      input.from,
      [
        `Pedido *#${order.code}* confirmado!`,
        renderCart(context),
        deliveryFee ? `Taxa de entrega: ${formatBRL(deliveryFee)}` : "Retirada no local",
        `Total: *${formatBRL(order.totalCents)}*`,
        context.addressText ? `Entrega: ${context.addressText}` : "",
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
