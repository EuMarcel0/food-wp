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
import type {
  ConversationContext,
  ConversationState,
  Fulfillment,
  PaymentMethod,
} from "../types.js";

const GREETING_KEYS = ["oi", "olá", "ola", "menu", "inicio", "início", "hi", "hello"];

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
      description: `${formatReais(product.price)}${product.description ? ` · ${product.description}` : ""}`,
    })),
  }));

  if (!sections.length) {
    await sendText(to, "O cardápio ainda não foi cadastrado.");
    return;
  }

  await sendList(to, intro, "Ver itens", sections);
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

  const persist = (nextState: ConversationState, nextContext = context) =>
    saveConversation(customer, nextState, nextContext);

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
    await persist("awaiting_quantity", context);
    await sendButtons(
      input.from,
      `*${product.name}* — ${formatReais(product.price)}\nQuantas unidades?`,
      [
        { id: "qty:1", title: "1" },
        { id: "qty:2", title: "2" },
        { id: "qty:3", title: "3" },
      ],
    );
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

    const already = context.cart.find((item) => item.productId === product.id);
    if (already) already.quantity += quantity;
    else {
      context.cart.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPriceCents: Math.round(product.price * 100),
      });
    }
    context.selectedProductId = undefined;
    await persist("cart", context);
    await sendButtons(
      input.from,
      `${quantity}x ${product.name} adicionado.\n\n${renderCart(context)}`,
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
