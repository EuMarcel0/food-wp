import { listAddons, listCrusts, listPaymentMethods, listProducts, listSizes } from "../data/repository.js";
import { formatReais } from "../lib/money.js";
import { chatJson } from "../lib/openai.js";
import {
  ADDON_GROUP_ID,
  CRUST_GROUP_ID,
  activeGroups,
  assembledName,
  cleanFlavorName,
  isSizeGroup,
  sizePrice,
  unitPriceCents,
} from "./assemble.js";
import type {
  Addon,
  CartItem,
  CartSelection,
  Crust,
  Product,
  ProductOptionGroup,
} from "../types.js";

/** Histórico curto da montagem do pedido na v2 (vai junto em cada chamada à IA). */
export type AiTurn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 12;

export function appendAiTurn(turns: AiTurn[] | undefined, turn: AiTurn): AiTurn[] {
  return [...(turns ?? []), { role: turn.role, content: turn.content.slice(0, 2000) }].slice(-MAX_TURNS);
}

/** Dados de entrega/pagamento que o cliente já soltou no meio do pedido. */
export type AiOrderHints = {
  fulfillment?: "delivery" | "pickup";
  address?: string;
  payment?: string;
};

export function mergeAiHints(current: AiOrderHints | undefined, next: AiOrderHints): AiOrderHints {
  return {
    fulfillment: next.fulfillment ?? current?.fulfillment,
    address: next.address ?? current?.address,
    payment: next.payment ?? current?.payment,
  };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type PizzaSize = { key: string; name: string; maxFlavors: number; price: number };

type OptionRef = { productId: string; group: ProductOptionGroup; optionId: string };

type Catalog = {
  text: string;
  pizzas: Map<string, Product>;
  sizes: Map<string, PizzaSize>;
  crusts: Map<string, Crust>;
  addons: Map<string, Addon>;
  products: Map<string, Product>;
  options: Map<string, OptionRef>;
};

function isPizzaFlavor(product: Product) {
  return Boolean(product.customizable && activeGroups(product).some(group => isSizeGroup(group)));
}

/** `onlyProducts`: catálogo reduzido a esses produtos (sem pizzas, adicionais e pagamentos). */
async function buildCatalog(opts?: { onlyProducts?: (product: Product) => boolean }): Promise<Catalog> {
  const only = opts?.onlyProducts;
  const [allProducts, allCrusts, allAddons, catalogSizes, paymentMethods] = await Promise.all([
    listProducts(),
    only ? Promise.resolve([] as Crust[]) : listCrusts(),
    only ? Promise.resolve([] as Addon[]) : listAddons(),
    only ? Promise.resolve([]) : listSizes(),
    only ? Promise.resolve([]) : listPaymentMethods().catch(() => []),
  ]);
  const products = allProducts.filter(item => item.active && (!only || only(item)));

  const pizzas = new Map<string, Product>();
  const others = new Map<string, Product>();
  const sizes = new Map<string, PizzaSize>();
  const crusts = new Map<string, Crust>();
  const addons = new Map<string, Addon>();
  const options = new Map<string, OptionRef>();

  const pizzaProducts = only ? [] : products.filter(isPizzaFlavor);
  const otherProducts = only ? products : products.filter(item => !isPizzaFlavor(item));

  // Tamanhos: união por nome entre as pizzas, preferindo o cadastro global de tamanhos.
  const sizeByName = new Map<string, Omit<PizzaSize, "key">>();
  for (const product of pizzaProducts) {
    for (const group of activeGroups(product).filter(item => isSizeGroup(item))) {
      const name = normalize(group.name);
      if (sizeByName.has(name)) continue;
      sizeByName.set(name, {
        name: group.name,
        maxFlavors: Math.max(1, group.maxSelect ?? 1) + 1,
        price: sizePrice(product, group),
      });
    }
  }
  for (const size of catalogSizes.filter(item => item.active)) {
    const current = sizeByName.get(normalize(size.name));
    if (!current) continue;
    current.name = size.name;
    current.maxFlavors = Math.max(1, size.maxSelect ?? 1) + 1;
    if (size.price > 0) current.price = size.price;
  }

  const lines: string[] = [];

  if (pizzaProducts.length) {
    lines.push("PIZZAS (cada item é um SABOR; pizza meio a meio = 2 sabores no mesmo tamanho):");
    pizzaProducts.forEach((product, index) => {
      const key = `p${index + 1}`;
      pizzas.set(key, product);
      const description = product.description?.trim();
      lines.push(
        `${key}: ${product.name}${product.pizzaKind ? ` (${product.pizzaKind})` : ""}${
          description && description.toLowerCase() !== "null" ? ` — ${description.slice(0, 140)}` : ""
        }`,
      );
    });

    lines.push("", "TAMANHOS DE PIZZA:");
    [...sizeByName.values()].forEach((size, index) => {
      const key = `s${index + 1}`;
      sizes.set(key, { key, ...size });
      lines.push(`${key}: ${size.name} — até ${size.maxFlavors} sabores — ${formatReais(size.price)}`);
    });

    const activeCrusts = allCrusts.filter(item => item.active);
    if (activeCrusts.length) {
      lines.push("", "BORDAS (só se o cliente pedir):");
      activeCrusts.forEach((crust, index) => {
        const key = `c${index + 1}`;
        crusts.set(key, crust);
        const price = crust.addsPrice && crust.price > 0 ? `+ ${formatReais(crust.price)}` : "grátis";
        lines.push(`${key}: ${crust.name} (pizza ${crust.pizzaKind}) — ${price}`);
      });
      // "Com borda" sem sabor = Catupiry (a de nome mais curto, ex.: "Catupiry" antes de "Catupiry com bacon").
      const defaults = [...crusts.entries()]
        .filter(([, crust]) => /catupiry|catupiri/.test(normalize(crust.name)))
        .sort(([, left], [, right]) => left.name.length - right.name.length);
      for (const kind of new Set(defaults.map(([, crust]) => crust.pizzaKind))) {
        const [key, crust] = defaults.find(([, item]) => item.pizzaKind === kind)!;
        lines.push(
          `BORDA PADRÃO (pizza ${kind}): se o cliente pedir "com borda"/"borda recheada" sem dizer o sabor, use ${key} (${crust.name}).`,
        );
      }
    }
  }

  const activeAddons = allAddons.filter(item => item.active);
  if (activeAddons.length) {
    lines.push("", "ADICIONAIS (só se o cliente pedir):");
    activeAddons.forEach((addon, index) => {
      const key = `a${index + 1}`;
      addons.set(key, addon);
      lines.push(`${key}: ${addon.name} — + ${formatReais(addon.price)}`);
    });
  }

  if (otherProducts.length) {
    lines.push("", "OUTROS PRODUTOS (bebidas, lanches etc.):");
    let optionIndex = 0;
    otherProducts.forEach((product, index) => {
      const key = `i${index + 1}`;
      others.set(key, product);
      lines.push(`${key}: ${product.name} [${product.categoryName}] — ${formatReais(product.price)}`);
      if (!product.customizable) return;
      for (const group of activeGroups(product)) {
        if (!group.options.length) continue;
        const rendered = group.options.map(option => {
          optionIndex += 1;
          const optionKey = `o${optionIndex}`;
          options.set(optionKey, { productId: product.id, group, optionId: option.id });
          return `${optionKey}=${option.name}${option.extraPrice > 0 ? ` (+${formatReais(option.extraPrice)})` : ""}`;
        });
        const rule = group.required ? `obrigatório, escolha ${Math.max(1, group.minSelect)} a ${group.maxSelect}` : `opcional, até ${group.maxSelect}`;
        lines.push(`   opções "${group.name}" (${rule}): ${rendered.join(", ")}`);
      }
    });
  }

  if (paymentMethods.length) {
    lines.push("", "FORMAS DE PAGAMENTO (use o nome exato em 'payment'):");
    lines.push(paymentMethods.map(method => method.name).join(" | "));
  }

  return { text: lines.join("\n"), pizzas, sizes, crusts, addons, products: others, options };
}

type AiItem = {
  kind: "pizza" | "product";
  quantity: number;
  size: string | null;
  flavors: string[];
  flavor_terms?: string[];
  product: string | null;
  options: string[];
  crust: string | null;
  addons: string[];
  notes: string | null;
};

type AiResult = {
  items: AiItem[];
  not_found: string[];
  question: string | null;
  answer: string | null;
  menu_requested: boolean;
  fulfillment: "delivery" | "pickup" | null;
  address: string | null;
  payment: string | null;
  fee_question: boolean;
  fee_neighborhood: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "items",
    "not_found",
    "question",
    "answer",
    "menu_requested",
    "fulfillment",
    "address",
    "payment",
    "fee_question",
    "fee_neighborhood",
  ],
  properties: {
    fee_question: {
      type: "boolean",
      description:
        "true se a ÚLTIMA mensagem do cliente pergunta a taxa/valor da entrega ou se entregam num bairro, ou responde com o bairro a uma pergunta de taxa feita antes.",
    },
    fee_neighborhood: {
      type: ["string", "null"],
      description: "Bairro citado nessa pergunta de taxa/entrega, como o cliente escreveu (ex.: 'Fazenda Campos'); senão null.",
    },
    answer: {
      type: ["string", "null"],
      description: "Resposta curta a perguntas do cliente (preço, frete, sabores etc.). Não bloqueia o pedido.",
    },
    menu_requested: {
      type: "boolean",
      description: "true só se a ÚLTIMA mensagem do cliente pede o cardápio/menu/opções/sabores.",
    },
    fulfillment: {
      type: ["string", "null"],
      enum: ["delivery", "pickup", null],
      description: "delivery se pediu entrega/mandou endereço; pickup se vai buscar/retirar; senão null.",
    },
    address: {
      type: ["string", "null"],
      description: "Endereço de entrega exatamente como o cliente escreveu (rua, número, bairro, referência).",
    },
    payment: {
      type: ["string", "null"],
      description: "Nome EXATO de uma forma de pagamento da lista, se o cliente disse como vai pagar.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "quantity", "size", "flavors", "flavor_terms", "product", "options", "crust", "addons", "notes"],
        properties: {
          kind: { type: "string", enum: ["pizza", "product"] },
          quantity: { type: "integer" },
          size: { type: ["string", "null"], description: "Código do tamanho (sN) quando kind=pizza." },
          flavors: { type: "array", items: { type: "string" }, description: "Códigos dos sabores (pN)." },
          flavor_terms: {
            type: "array",
            items: { type: "string" },
            description:
              "Mesma ordem de flavors: o trecho EXATO que o cliente escreveu para cada sabor (ex.: 'carne seca', 'frango catupiry'). Se escolheu de uma lista numerada, o nome do sabor escolhido. Vazio quando kind=product.",
          },
          product: { type: ["string", "null"], description: "Código do produto (iN) quando kind=product." },
          options: { type: "array", items: { type: "string" }, description: "Códigos das opções (oN)." },
          crust: { type: ["string", "null"], description: "Código da borda (cN) ou null." },
          addons: { type: "array", items: { type: "string" }, description: "Códigos dos adicionais (aN)." },
          notes: { type: ["string", "null"], description: "Observação do item (ex.: sem cebola)." },
        },
      },
    },
    not_found: {
      type: "array",
      items: { type: "string" },
      description: "Trechos pedidos que não existem no cardápio.",
    },
    question: {
      type: ["string", "null"],
      description: "Pergunta curta ao cliente quando faltar informação obrigatória (ex.: tamanho).",
    },
  },
} as const;

function systemPrompt(catalogText: string) {
  return [
    "Você monta pedidos de uma pizzaria/lanchonete a partir de mensagens de WhatsApp em português.",
    "Use SOMENTE os códigos do cardápio abaixo. Nunca invente itens, códigos ou preços.",
    "Retorne SEMPRE o pedido COMPLETO (todos os itens pedidos até agora na conversa), aplicando correções que o cliente fizer.",
    "Regras:",
    "- Pizza: kind=pizza, size=código sN, flavors=lista de pN. 'meia', 'metade', '1/2', 'meio a meio' = 2 sabores; '1/3' = 3 sabores.",
    "- Respeite o limite de sabores do tamanho. Se o cliente passar do limite, pergunte em 'question'.",
    "- Tamanho: associe apelidos pela letra/nome do tamanho: P = pequena/broto, M = média, G = grande, F = família/gigante (ex.: 'uma família' = tamanho que começa com F). Se não der para saber o tamanho de uma pizza, deixe size=null e pergunte em 'question'.",
    "- Aceite erros de digitação e nomes aproximados (ex.: 'frango c/ catupiry' = sabor com frango e catupiry; 'coca zero 1l' = Coca-Cola Zero 1L).",
    "- Borda e adicionais só quando o cliente pedir explicitamente. Borda precisa ser do mesmo tipo da pizza (salgada/doce).",
    "- 'Com borda' sem sabor: use a BORDA PADRÃO do cardápio para o tipo da pizza, sem perguntar. Se não houver borda padrão para esse tipo, pergunte o sabor da borda em 'question'.",
    "- Outros produtos: kind=product, product=código iN, com options quando houver opções obrigatórias ditas pelo cliente.",
    "- quantity >= 1. 'duas cocas' = quantity 2.",
    "- Itens que não existem no cardápio vão em not_found (texto curto como o cliente escreveu). Não coloque ali saudações, perguntas, endereço, pagamento ou palavras soltas.",
    "",
    "Clientes escrevem de forma bagunçada. Seja tolerante:",
    "- Várias mensagens seguidas (uma por linha) formam UM pedido só. Junte as informações de todas as mensagens do cliente na conversa.",
    "- Ignore ruído: saudações, 'por favor', 'moço', 'boa noite', 'tô com fome', emojis, 'kkk', 'rápido' etc.",
    "- Sabores ditos juntos sem outro tamanho/quantidade ('quatro queijos e atum', 'calabresa com frango') = UMA pizza meio a meio, se o tamanho permitir; se passar do limite, pergunte.",
    "- 'Uma família nordestina e lombinho' = UMA pizza família meio Nordestina e meio Lombinho (um item com 2 sabores), NUNCA duas pizzas. Só são duas pizzas quando o cliente diz a quantidade ('duas', '2') ou repete o tamanho/artigo ('uma família nordestina e uma família lombinho').",
    "- Quantidade por fatias/pedaços: use o tamanho cujo nome cite as fatias; se nenhum citar, use o padrão P/broto = 4, M = 6, G = 8, F/família = 12 fatias (o mais próximo) e avise em 'answer' qual tamanho considerou.",
    "- Tamanho informado numa mensagem e sabores em outra: combine (ex.: 'o preço da M' e depois 'quero de calabresa' = pizza M de calabresa, se não houver outro tamanho pedido).",
    "- Escrita por extenso ou abreviada: 'uma', 'duas', '2x', 'refri', 'refrigerante 2 litros', 'coca lata', 'guaraná 1,5' etc.",
    "- Nomes de sabores com erros ('calabreza', 'frango catupiri', 'portugueza', 'mussarela/muçarela', '4 queijo') = sabor mais parecido do cardápio.",
    "- Se o cliente pedir algo vago de bebida ('um refri') e houver várias opções, pergunte qual em 'question'.",
    "",
    "Sabores citados por ingrediente:",
    "- Sempre coloque a pizza em items com o sabor mais provável, e em flavor_terms o trecho EXATO que o cliente usou para cada sabor (ex.: 'carne seca'). O sistema confere o cardápio e pergunta ao cliente se houver mais de um sabor com aquele termo. Não pergunte isso em 'question'.",
    "- Ingredientes diferentes não são sinônimos: 'carne seca' ≠ 'carne de sol', 'frango' ≠ 'peru'.",
    "- Se a última mensagem do assistente listou sabores numerados e o cliente responder com o número ('1', '02', 'a terceira') ou o nome, use o sabor correspondente da lista (com o tamanho/quantidade já ditos) e coloque em flavor_terms o NOME do sabor escolhido.",
    "",
    "Perguntas e outras informações (não bloqueiam o pedido):",
    "- Perguntas de preço/tamanho/sabores: responda em 'answer' usando SÓ os preços do cardápio (ex.: 'A pizza M custa R$ 55,00 e aceita até 2 sabores.').",
    "- Pergunta de frete/taxa/se entregam num bairro: fee_question=true e fee_neighborhood=bairro citado (ou null se não citou). O sistema responde a taxa pelo cadastro de bairros: NÃO fale de taxa/entrega em 'answer' (nunca invente valor de frete). Se a mensagem anterior do assistente pediu o bairro para informar a taxa, a resposta do cliente com o bairro também é fee_question=true.",
    "- Pedido de cardápio/menu/sabores/opções na ÚLTIMA mensagem do cliente: menu_requested=true (mensagens antigas não contam).",
    "- 'answer' responde só às perguntas da ÚLTIMA mensagem do cliente; se não houver pergunta nova, answer=null.",
    "- Endereço de entrega em qualquer mensagem: copie em 'address' e use fulfillment=delivery. 'Vou buscar', 'retirar', 'pego aí' = fulfillment=pickup.",
    "- Forma de pagamento ('no pix', 'cartão', 'dinheiro', 'troco pra 100'): 'payment' = nome exato da lista de formas de pagamento; se não houver correspondência, null.",
    "- Perguntas sobre horário, tempo de entrega ou coisas fora do cardápio: responda em 'answer' que um atendente pode confirmar, sem inventar.",
    "",
    "Quando usar 'question':",
    "- Só quando faltar algo OBRIGATÓRIO para montar um item (tamanho da pizza, qual bebida, limite de sabores).",
    "- Se ainda não houver item nenhum, deixe items vazio e use 'question' apenas se o cliente começou um pedido incompleto; saudação/pergunta pura vai em 'answer'.",
    "- 'question' e 'answer' devem ser curtas, simpáticas, em português, sem mencionar códigos.",
    "",
    "CARDÁPIO:",
    catalogText,
  ].join("\n");
}

type AiOutcomeExtras = {
  notFound: string[];
  answer?: string;
  menuRequested: boolean;
  hints: AiOrderHints;
  /** Cliente perguntou a taxa/se entrega; `neighborhood` = bairro citado. */
  feeQuestion?: { neighborhood?: string };
};

export type AiOrderOutcome =
  | ({ status: "ok"; items: CartItem[] } & AiOutcomeExtras)
  | ({ status: "question"; question: string; items: CartItem[] } & AiOutcomeExtras)
  | ({ status: "empty" } & AiOutcomeExtras)
  | { status: "error"; message: string };

function crustSelection(crust: Crust): CartSelection {
  return {
    groupId: CRUST_GROUP_ID,
    groupName: "Borda",
    priceMode: "addon",
    options: [{ id: crust.id, name: crust.name, extraPrice: crust.addsPrice ? crust.price : 0 }],
    skipped: false,
  };
}

function addonSelection(list: Addon[]): CartSelection {
  return {
    groupId: ADDON_GROUP_ID,
    groupName: "Adicional",
    priceMode: "addon",
    options: list.map(addon => ({ id: addon.id, name: addon.name, extraPrice: addon.price })),
    skipped: false,
  };
}

function clipNotes(raw: string | null) {
  const text = raw?.replace(/\s+/g, " ").trim().slice(0, 240);
  return text || null;
}

function clampQuantity(value: number) {
  return Math.min(50, Math.max(1, Math.round(Number(value) || 1)));
}

function findSizeGroup(product: Product, sizeName: string) {
  const want = normalize(sizeName);
  const groups = activeGroups(product).filter(group => isSizeGroup(group));
  return (
    groups.find(group => normalize(group.name) === want) ??
    groups.find(group => {
      const name = normalize(group.name);
      return name.startsWith(want) || want.startsWith(name);
    }) ??
    null
  );
}

const STOPWORDS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "com", "c", "e", "pizza", "sabor", "meia", "metade"]);

function termTokens(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(token => token && !STOPWORDS.has(token));
}

function flavorDescription(product: Product) {
  const description = product.description?.trim();
  return description && description.toLowerCase() !== "null" ? description : "";
}

const CHOICE_MARKER = "Há mais de um sabor";

type FlavorChoice = { term: string; products: Product[] };

type FlavorResolution = { product: Product } | { choice: FlavorChoice };

/**
 * Confere o termo que o cliente usou contra o cardápio, de forma literal:
 * nome exato → esse sabor; termo presente (como frase) no nome/descrição de
 * 2+ sabores → o cliente escolhe; de 1 só → esse sabor; nenhum → palpite da IA.
 */
function resolveFlavor(term: string, guess: Product, catalog: Pick<Catalog, "pizzas">, turns: AiTurn[]): FlavorResolution {
  const tokens = termTokens(term);
  if (!tokens.length) return { product: guess };
  const pizzas = [...catalog.pizzas.values()];
  const phrase = ` ${tokens.join(" ")} `;
  const sameTokens = (product: Product) => {
    const name = termTokens(cleanFlavorName(product.name));
    return name.length === tokens.length && tokens.every(token => name.includes(token));
  };

  const exact = pizzas.filter(sameTokens);
  if (exact.length === 1) return { product: exact[0] };

  const candidates = pizzas.filter(product => {
    const name = termTokens(cleanFlavorName(product.name));
    if (tokens.every(token => name.includes(token))) return true;
    return ` ${termTokens(`${product.name} ${flavorDescription(product)}`).join(" ")} `.includes(phrase);
  });
  if (!candidates.length) return { product: guess };
  if (candidates.length === 1) return { product: candidates[0] };

  // Cliente já escolheu numa lista anterior: aceita o sabor se ele estava entre os listados.
  const chosenName = cleanFlavorName(guess.name);
  const alreadyAsked = turns.some(
    turn => turn.role === "assistant" && turn.content.includes(CHOICE_MARKER) && turn.content.includes(`*${chosenName}*`)
  );
  if (alreadyAsked && candidates.some(product => product.id === guess.id)) return { product: guess };

  return { choice: { term, products: candidates.slice(0, MAX_FLAVOR_CHOICES) } };
}

const PIZZA_SIZE_WORD = /\b(familias?|grandes?|gigantes?|medias?|pequenas?|brotos?)\b/g;
const MORE_PIZZAS =
  /\b(duas|dois|tres|quatro|cinco|seis|outra|outro|outras|outros|mais uma|mais um|e uma|e um|uma de|um de|cada)\b|\b[2-9]\s*x?\s*(pizzas?|familias?|grandes?|gigantes?|medias?|pequenas?|brotos?)\b/;

/**
 * Cliente citou UMA pizza ("uma família nordestina e lombinho") e a IA devolveu uma pizza por sabor.
 * Pela regra do cardápio isso é meio a meio: junta numa pizza só, se o tamanho aceitar os sabores.
 */
function mergeSinglePizzaSplit(result: AiResult, catalog: Catalog, turns: AiTurn[]) {
  const pizzas = result.items.filter(item => item.kind === "pizza");
  if (pizzas.length < 2) return;
  const size = pizzas[0].size ? catalog.sizes.get(pizzas[0].size) : undefined;
  if (!size || pizzas.some(item => item.size !== pizzas[0].size || clampQuantity(item.quantity) !== 1)) return;
  const flavors = pizzas.flatMap(item => item.flavors);
  if (flavors.length > size.maxFlavors) return;

  const said = normalize(
    turns
      .filter(turn => turn.role === "user" && !turn.content.startsWith("Bebidas:"))
      .map(turn => turn.content)
      .join("\n"),
  );
  if ((said.match(PIZZA_SIZE_WORD) ?? []).length !== 1 || MORE_PIZZAS.test(said)) return;

  const merged: AiItem = {
    ...pizzas[0],
    flavors,
    flavor_terms: pizzas.flatMap(item => item.flavor_terms ?? []),
    crust: pizzas.find(item => item.crust)?.crust ?? null,
    addons: [...new Set(pizzas.flatMap(item => item.addons))],
    notes: pizzas.map(item => item.notes).filter(Boolean).join("; ") || null,
  };
  result.items = [merged, ...result.items.filter(item => item.kind !== "pizza")];
}

/** Converte a resposta da IA em itens do carrinho (preço sempre do cadastro). */
function toCartItems(result: AiResult, catalog: Catalog, turns: AiTurn[] = []) {
  const items: CartItem[] = [];
  const problems: string[] = [];
  const choices: FlavorChoice[] = [];

  for (const raw of result.items) {
    const quantity = clampQuantity(raw.quantity);

    if (raw.kind === "pizza") {
      const size = raw.size ? catalog.sizes.get(raw.size) : undefined;
      const resolved: Product[] = [];
      let ambiguous = false;
      raw.flavors.forEach((key, index) => {
        const guess = catalog.pizzas.get(key);
        if (!guess) return;
        const outcome = resolveFlavor(raw.flavor_terms?.[index] ?? "", guess, catalog, turns);
        if ("choice" in outcome) {
          ambiguous = true;
          if (!choices.some(item => normalize(item.term) === normalize(outcome.choice.term))) choices.push(outcome.choice);
          return;
        }
        resolved.push(outcome.product);
      });
      if (ambiguous) continue;
      const flavors = resolved.filter((item, index) => resolved.findIndex(other => other.id === item.id) === index);
      if (!flavors.length) continue;
      if (!size) {
        const sizeNames = [...catalog.sizes.values()].map(item => item.name).join(", ");
        problems.push(
          `Qual o *tamanho* da pizza de ${flavors.map(item => cleanFlavorName(item.name)).join(" e ")}? (${sizeNames})`
        );
        continue;
      }
      if (flavors.length > size.maxFlavors) {
        problems.push(`A pizza *${size.name}* aceita até *${size.maxFlavors}* sabores. Quais sabores você prefere?`);
        continue;
      }
      const base = flavors[0];
      const group = findSizeGroup(base, size.name);
      if (!group) {
        problems.push(`O sabor *${cleanFlavorName(base.name)}* não está disponível no tamanho *${size.name}*.`);
        continue;
      }
      const extras: CartSelection[] = [
        {
          groupId: group.id,
          groupName: group.name,
          priceMode: group.priceMode,
          basePrice: sizePrice(base, group),
          options: flavors.slice(1).map(item => ({ id: item.id, name: item.name, extraPrice: 0 })),
          ...(flavors.length === 1 ? { skipped: true } : {}),
        },
      ];
      const crust = raw.crust ? catalog.crusts.get(raw.crust) : undefined;
      if (crust && base.crustsEnabled && (!base.pizzaKind || crust.pizzaKind === base.pizzaKind)) {
        extras.push(crustSelection(crust));
      }
      const addons = raw.addons.map(key => catalog.addons.get(key)).filter((item): item is Addon => Boolean(item));
      if (addons.length && base.addonsEnabled) extras.push(addonSelection(addons));

      items.push({
        productId: base.id,
        name: assembledName(base, extras),
        catalogName: base.name,
        quantity,
        unitPriceCents: unitPriceCents(base, extras),
        extras,
        notes: clipNotes(raw.notes),
      });
      continue;
    }

    const product = raw.product ? catalog.products.get(raw.product) : undefined;
    if (!product) continue;
    const extras: CartSelection[] = [];
    if (product.customizable) {
      const picked = raw.options
        .map(key => catalog.options.get(key))
        .filter((ref): ref is OptionRef => Boolean(ref && ref.productId === product.id));
      for (const group of activeGroups(product)) {
        const chosen = picked.filter(ref => ref.group.id === group.id).slice(0, Math.max(1, group.maxSelect));
        const need = group.required ? Math.max(1, group.minSelect) : 0;
        if (chosen.length < need) {
          problems.push(`Para *${product.name}*, escolha: ${group.name} (${group.options.map(option => option.name).join(", ")}).`);
          break;
        }
        if (!chosen.length) continue;
        extras.push({
          groupId: group.id,
          groupName: group.name,
          priceMode: group.priceMode,
          options: chosen.map(ref => {
            const option = group.options.find(item => item.id === ref.optionId)!;
            return { id: option.id, name: option.name, extraPrice: option.extraPrice };
          }),
        });
      }
    }
    const addons = raw.addons.map(key => catalog.addons.get(key)).filter((item): item is Addon => Boolean(item));
    if (addons.length && product.addonsEnabled) extras.push(addonSelection(addons));

    items.push({
      productId: product.id,
      name: extras.some(item => item.groupId !== ADDON_GROUP_ID) ? assembledName(product, extras) : product.name,
      catalogName: product.name,
      quantity,
      unitPriceCents: unitPriceCents(product, extras),
      extras,
      notes: clipNotes(raw.notes),
    });
  }

  return { items, problems, choices };
}

const MAX_FLAVOR_CHOICES = 8;

/** Lista numerada (nome em negrito + descrição) para o cliente escolher o sabor. */
function flavorChoiceQuestion(choice: FlavorChoice | undefined) {
  if (!choice) return undefined;
  const term = choice.term.replace(/\s+/g, " ").trim().slice(0, 40);
  const lines = [`🤔 ${CHOICE_MARKER} de pizza com *${term}*:`, ""];
  choice.products.forEach((product, index) => {
    const description = flavorDescription(product);
    lines.push(`*${String(index + 1).padStart(2, "0")}* - *${cleanFlavorName(product.name)}*`);
    if (description) lines.push(description.slice(0, 160));
    lines.push("");
  });
  lines.push("Qual você deseja? Digite o *nome* ou o *número*.");
  return lines.join("\n");
}

/**
 * Interpreta o pedido em texto livre (v2). `turns` já inclui a última mensagem do cliente.
 */
export async function interpretOrder(turns: AiTurn[]): Promise<AiOrderOutcome> {
  let catalog: Catalog;
  try {
    catalog = await buildCatalog();
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Falha ao carregar o cardápio." };
  }

  let result: AiResult;
  try {
    result = await chatJson<AiResult>({
      schemaName: "pedido",
      schema: SCHEMA as unknown as Record<string, unknown>,
      metadata: { flow: "v2-order" },
      messages: [{ role: "system", content: systemPrompt(catalog.text) }, ...turns],
    });
  } catch (error) {
    console.error("[ai-order] falha na OpenAI:", error instanceof Error ? error.message : error);
    return { status: "error", message: error instanceof Error ? error.message : "Falha na IA." };
  }

  mergeSinglePizzaSplit(result, catalog, turns);
  const { items, problems, choices } = toCartItems(result, catalog, turns);
  const notFound = (result.not_found ?? []).map(item => item.trim()).filter(Boolean).slice(0, 5);
  const question = flavorChoiceQuestion(choices[0]) ?? problems[0] ?? (result.question?.trim() || undefined);
  const address = result.address?.replace(/\s+/g, " ").trim().slice(0, 300);
  const extras: AiOutcomeExtras = {
    notFound,
    answer: result.answer?.trim() || undefined,
    menuRequested: Boolean(result.menu_requested),
    hints: {
      fulfillment: result.fulfillment ?? (address ? "delivery" : undefined),
      address: address && address.length >= 5 ? address : undefined,
      payment: result.payment?.trim() || undefined,
    },
    feeQuestion: result.fee_question
      ? { neighborhood: result.fee_neighborhood?.replace(/\s+/g, " ").trim().slice(0, 80) || undefined }
      : undefined,
  };

  if (question) return { status: "question", question, items, ...extras };
  if (!items.length) return { status: "empty", ...extras };
  return { status: "ok", items, ...extras };
}

function drinksSystemPrompt(catalogText: string) {
  return [
    "Você identifica BEBIDAS pedidas numa mensagem de WhatsApp em português, respondendo à pergunta 'Deseja uma bebida?'.",
    "Use SOMENTE os códigos do cardápio abaixo. Nunca invente itens, códigos ou preços.",
    "Regras:",
    "- Cada bebida: kind=product, product=código iN, com options quando houver opções obrigatórias ditas pelo cliente. size=null, flavors=[], crust=null, addons=[].",
    "- Pode haver várias bebidas. quantity >= 1 ('duas cocas' = quantity 2; '2x guaraná lata' = quantity 2).",
    "- Aceite erros de digitação e nomes aproximados ('coca 2l', 'coca zero 1l', 'guarana lata', 'agua com gas', 'suco de laranja').",
    "- Se o cliente pedir algo vago ('um refri', 'uma coca') e houver várias opções, pergunte qual em 'question' (curta, simpática, sem códigos).",
    "- Bebidas que não existem no cardápio vão em not_found (texto curto como o cliente escreveu).",
    "- answer=null, menu_requested=false, fulfillment=null, address=null, payment=null, flavor_terms=[], fee_question=false, fee_neighborhood=null.",
    "",
    "CARDÁPIO DE BEBIDAS:",
    catalogText,
  ].join("\n");
}

/** v2: interpreta a resposta de "Deseja uma bebida?" usando só os produtos de bebida. */
export async function interpretDrinks(
  text: string,
  isDrink: (product: Product) => boolean,
): Promise<AiOrderOutcome> {
  let catalog: Catalog;
  try {
    catalog = await buildCatalog({ onlyProducts: isDrink });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Falha ao carregar o cardápio." };
  }

  let result: AiResult;
  try {
    result = await chatJson<AiResult>({
      schemaName: "bebidas",
      schema: SCHEMA as unknown as Record<string, unknown>,
      metadata: { flow: "v2-drinks" },
      messages: [
        { role: "system", content: drinksSystemPrompt(catalog.text) },
        { role: "user", content: text.slice(0, 1200) },
      ],
    });
  } catch (error) {
    console.error("[ai-drinks] falha na OpenAI:", error instanceof Error ? error.message : error);
    return { status: "error", message: error instanceof Error ? error.message : "Falha na IA." };
  }

  const { items, problems } = toCartItems(
    { ...result, items: result.items.filter(item => item.kind === "product") },
    catalog,
  );
  const notFound = (result.not_found ?? []).map(item => item.trim()).filter(Boolean).slice(0, 5);
  const question = problems[0] ?? (result.question?.trim() || undefined);
  const extras: AiOutcomeExtras = { notFound, menuRequested: false, hints: {} };

  if (question) return { status: "question", question, items, ...extras };
  if (!items.length) return { status: "empty", ...extras };
  return { status: "ok", items, ...extras };
}
