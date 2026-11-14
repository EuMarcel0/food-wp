import { getStore, listAddons, listCrusts, listPaymentMethods, listProducts, listSizes } from "../data/repository.js";
import { formatReais } from "../lib/money.js";
import { chatJson } from "../lib/openai.js";
import {
  ADDON_GROUP_ID,
  CRUST_GROUP_ID,
  noCrustSelection,
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
          `BORDA PADRÃO (pizza ${kind}): se o cliente pedir "com borda"/"borda" sem sabor, use ${key} (${crust.name}). Nunca pergunte se a borda é salgada ou doce.`,
        );
      }
    }
  }

  const activeAddons = allAddons.filter(item => item.active);
  if (activeAddons.length) {
    lines.push(
      "",
      "ADICIONAIS (só com pedido explícito: 'adicional', 'extra', 'por cima'. Nome solto numa lista de pizza = SABOR, não adicional):",
    );
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
  hours_question: boolean;
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
    "hours_question",
  ],
  properties: {
    hours_question: {
      type: "boolean",
      description:
        "true se a ÚLTIMA mensagem do cliente pergunta o horário de funcionamento (que horas fecha/abre/encerra, até que horas atendem, se ainda estão abertos).",
    },
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
    "- NUNCA monte UMA pizza com sabores salgados E doces juntos (ex.: meia calabresa meia chocolate). Se o cliente pedir isso, pergunte em 'question' quais sabores ficarão na pizza (só salgados ou só doces). Pode haver pizzas separadas: uma salgada e outra doce.",
    "- Respeite o limite de sabores do tamanho. Se o cliente passar do limite, pergunte em 'question'.",
    "- Tamanho: associe apelidos pela letra/nome do tamanho: P = pequena/broto, M = média, G = grande, F = família/gigante (ex.: 'uma família', 'F - 12 Fatias', '12 fatias' = tamanho F). Se o tamanho já foi dito na conversa (ou na pergunta anterior do assistente), aplique em TODAS as pizzas sem size. Só deixe size=null e pergunte se realmente não houver tamanho.",
    "- Nome da loja / 'casa das pizzas' NÃO é sabor. Ignore como sabor.",
    "- Aceite erros de digitação e nomes aproximados (ex.: 'frango c/ catupiry' = sabor com frango e catupiry; 'coca zero 1l' = Coca-Cola Zero 1L; 'creme cheese' / 'creme chesse' = o sabor do cardápio).",
    "- Nunca coloque em not_found um sabor que existe no cardápio com grafia parecida. Use o código pN e o trecho do cliente em flavor_terms.",
    "- Borda só quando o cliente pedir (ex.: 'borda de catupiry', 'com borda', 'borda'). O tipo da borda (salgada/doce) SEGUE o tipo dos sabores da pizza: NUNCA pergunte 'borda salgada ou doce'.",
    "- 'Com borda'/'borda' sem sabor: use a BORDA PADRÃO do cardápio para o tipo da pizza (salgada→borda salgada, doce→borda doce), sem perguntar. Se não houver borda padrão, pergunte só o SABOR da borda (ex.: Catupiry ou Cheddar), nunca salgada/doce.",
    "- 'sem borda' / 'sem recheio na borda': crust=null. O sistema marca Sem borda no pedido — não pergunte borda.",
    "- 'borda pra retirar' / 'com borda, vou buscar' = crust + fulfillment=pickup (retirada). Não é pergunta de tipo de borda.",
    "- Adicionais (aN) SÓ com pedido explícito: 'adicional de…', 'extra…', 'por cima', 'mais catupiry no adicional'. Sem essas palavras, NÃO use addons.",
    "- Lista 'pizza nordestina, queijo, borda catupiry' = sabores [nordestina, queijo/mussarela] + crust. NUNCA trate 'queijo'/'mussarela'/'calabresa' como adicional quando vier na lista de sabores.",
    "- 'queijo' como sabor = pizza Mussarela / 4 Queijos / Queijo do cardápio (flavor_terms='queijo'), nunca addon Mussarela.",
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
    "- Pergunta de horário de funcionamento (que horas fecha/abre/encerra, até que horas atendem): hours_question=true. O sistema responde o horário pelo cadastro da loja: NÃO fale de horário em 'answer'.",
    "- Perguntas sobre tempo de entrega ou coisas fora do cardápio: responda em 'answer' que um atendente pode confirmar, sem inventar.",
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
  /** Cliente perguntou o horário de funcionamento. */
  hoursQuestion?: boolean;
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

function sizeCodeFromText(text: string, catalog: Pick<Catalog, "sizes">) {
  const plain = normalize(text)
    .replace(/(\d)\s*fatias?\b/g, "$1 fatias")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  const letter = plain.match(/\b([pmgf])\b(?:\s*[-–]?\s*\d+\s*fatias?)?/)?.[1];
  const fatias = plain.match(/\b(\d+)\s*fatias?\b/)?.[1];
  const named =
    /\b(familias?|gigantes?)\b/.test(plain)
      ? "f"
      : /\b(grandes?)\b/.test(plain)
        ? "g"
        : /\b(medias?)\b/.test(plain)
          ? "m"
          : /\b(pequenas?|brotos?)\b/.test(plain)
            ? "p"
            : null;
  const wantLetter = letter ?? named;
  const entries = [...catalog.sizes.entries()];
  if (wantLetter) {
    const match =
      entries.find(([, size]) => normalize(size.name).startsWith(wantLetter)) ??
      entries.find(([, size]) => normalize(size.name).includes(` ${wantLetter} `));
    if (match) return match[0];
  }
  if (fatias) {
    const match = entries.find(([, size]) => normalize(size.name).includes(`${fatias} fatia`));
    if (match) return match[0];
  }
  return (
    entries.find(([, size]) => {
      const name = normalize(size.name);
      return plain === name || plain.startsWith(name) || name.startsWith(plain);
    })?.[0] ?? null
  );
}

/** Se o assistente perguntou o tamanho e o cliente respondeu só o tamanho, aplica nas pizzas sem size. */
function applySizeFollowUp(result: AiResult, catalog: Catalog, turns: AiTurn[]) {
  const missing = result.items.filter(item => item.kind === "pizza" && !item.size);
  if (!missing.length) return;

  const lastUser = [...turns].reverse().find(turn => turn.role === "user")?.content ?? "";
  const lastAssistant = [...turns].reverse().find(turn => turn.role === "assistant")?.content ?? "";
  const askedSize = /qual o \*?tamanho\*?/i.test(lastAssistant) || /tamanho da pizza/i.test(lastAssistant);
  const fromLast = sizeCodeFromText(lastUser, catalog);
  if (askedSize && fromLast) {
    for (const item of missing) item.size = fromLast;
    return;
  }

  // Tamanho já dito na conversa (ex.: "pizza F") e a IA deixou size=null.
  const fromHistory = sizeCodeFromText(
    turns.filter(turn => turn.role === "user").map(turn => turn.content).join("\n"),
    catalog,
  );
  if (!fromHistory) return;
  for (const item of missing) item.size = fromHistory;
}

function isStoreNameFlavor(term: string, storeName: string) {
  const flavor = normalize(term).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const store = normalize(storeName).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!flavor || !store) return false;
  if (flavor === store || store.includes(flavor) || flavor.includes(store)) return true;
  return /^(casa das pizzas|casa da pizza|pizzaria)$/.test(flavor);
}

/** Remove "sabor" que na verdade é o nome da loja (ex.: meia casa das pizzas). */
function dropStoreNameFlavors(result: AiResult, catalog: Catalog, storeName: string) {
  for (const item of result.items) {
    if (item.kind !== "pizza") continue;
    const keep: string[] = [];
    const keepTerms: string[] = [];
    item.flavors.forEach((key, index) => {
      const product = catalog.pizzas.get(key);
      const term = item.flavor_terms?.[index] ?? product?.name ?? key;
      if (isStoreNameFlavor(term, storeName) || (product && isStoreNameFlavor(product.name, storeName))) return;
      keep.push(key);
      keepTerms.push(item.flavor_terms?.[index] ?? "");
    });
    item.flavors = keep;
    if (item.flavor_terms) item.flavor_terms = keepTerms;
  }
  result.items = result.items.filter(item => item.kind !== "pizza" || item.flavors.length > 0);
}

function defaultCrustKey(catalog: Catalog, kind: "salgada" | "doce" | null | undefined) {
  const entries = [...catalog.crusts.entries()].filter(([, crust]) => !kind || crust.pizzaKind === kind);
  if (!entries.length) return null;
  const preferred = entries
    .filter(([, crust]) => /catupiry|catupiri/.test(normalize(crust.name)))
    .sort(([, left], [, right]) => left.name.length - right.name.length);
  return (preferred[0] ?? entries[0])?.[0] ?? null;
}

function pizzaKindFromItem(item: AiItem, catalog: Catalog) {
  for (const key of item.flavors) {
    const kind = catalog.pizzas.get(key)?.pizzaKind;
    if (kind === "salgada" || kind === "doce") return kind;
  }
  return null;
}

function userSaidNoCrust(turns: AiTurn[]) {
  const said = normalize(
    turns
      .filter(turn => turn.role === "user")
      .map(turn => turn.content)
      .join("\n"),
  );
  return /\bsem borda\b/.test(said) || /\bsem recheio\b/.test(said);
}

/**
 * Cliente pediu borda sem sabor: aplica a padrão do tipo da pizza.
 * Nunca deixa a IA perguntar "borda salgada ou doce".
 */
function applyDefaultCrust(result: AiResult, catalog: Catalog, turns: AiTurn[]) {
  if (userSaidNoCrust(turns)) return;
  const said = normalize(
    turns
      .filter(turn => turn.role === "user")
      .map(turn => turn.content)
      .join("\n"),
  );
  const wantsCrust = /\bborda\b/.test(said);
  if (!wantsCrust) return;

  for (const item of result.items) {
    if (item.kind !== "pizza" || item.crust) continue;
    const kind = pizzaKindFromItem(item, catalog);
    const key = defaultCrustKey(catalog, kind);
    if (key) item.crust = key;
  }
}

/** Pergunta inválida da IA sobre tipo de borda — descartar. */
function sanitizeAiQuestion(question: string | null | undefined) {
  const text = question?.trim() || "";
  if (!text) return undefined;
  if (/borda\s+(salgada|doce)|salgada\s+ou\s+doce|doce\s+ou\s+salgada/i.test(text)) return undefined;
  return text;
}

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "c",
  "e",
  "pizza",
  "pizzas",
  "sabor",
  "sabores",
  "meia",
  "metade",
  "quero",
  "uma",
  "um",
]);

function termTokens(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(token => token && !STOPWORDS.has(token));
}

/** Distância de edição ≤ 1 (cheese ↔ chesse, catupiri ↔ catupiry). */
function tokensNearMatch(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (Math.min(left.length, right.length) < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

function tokenInList(token: string, list: string[]) {
  return list.some(item => item === token || tokensNearMatch(token, item));
}

function flavorDescription(product: Product) {
  const description = product.description?.trim();
  return description && description.toLowerCase() !== "null" ? description : "";
}

const CHOICE_MARKER = "Há mais de um sabor";

type FlavorChoice = { term: string; products: Product[] };

type FlavorResolution = { product: Product } | { choice: FlavorChoice };

function flavorCandidates(term: string, catalog: Pick<Catalog, "pizzas">) {
  const tokens = termTokens(term);
  if (!tokens.length) return [] as Product[];
  const pizzas = [...catalog.pizzas.values()];
  const phrase = ` ${tokens.join(" ")} `;

  const exact = pizzas.filter(product => {
    const name = termTokens(cleanFlavorName(product.name));
    return (
      name.length === tokens.length &&
      tokens.every(token => tokenInList(token, name)) &&
      name.every(token => tokenInList(token, tokens))
    );
  });
  if (exact.length) return exact;

  return pizzas.filter(product => {
    const name = termTokens(cleanFlavorName(product.name));
    if (tokens.every(token => tokenInList(token, name))) return true;
    const haystack = termTokens(`${product.name} ${flavorDescription(product)}`);
    if (tokens.every(token => tokenInList(token, haystack))) return true;
    return ` ${haystack.join(" ")} `.includes(phrase);
  });
}

/**
 * Confere o termo que o cliente usou contra o cardápio (com tolerância a typo):
 * nome exato → esse sabor; termo presente no nome/descrição de 2+ → pergunta;
 * de 1 só → esse sabor; nenhum → palpite da IA.
 */
function resolveFlavor(term: string, guess: Product, catalog: Pick<Catalog, "pizzas">, turns: AiTurn[]): FlavorResolution {
  const tokens = termTokens(term);
  if (!tokens.length) return { product: guess };

  const candidates = flavorCandidates(term, catalog);
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

const EXPLICIT_ADDON =
  /\b(adiciona(?:l|is)?|extras?|por cima|a mais)\b/;

/** "queijo" e variações costumam ser sabor (mussarela), não adicional. */
function cheeseFlavorTerms(addonName: string) {
  const name = normalize(addonName);
  if (!/mussarela|mucarela|mu[cç]arela|queijo/.test(name)) return [] as string[];
  return ["queijo", "mussarela", "mucarela", "muçarela", addonName];
}

/**
 * Se a IA marcou um sabor como adicional (ex.: "nordestina, queijo" → addon Mussarela),
 * move para flavors quando o cliente não pediu adicional/extra explicitamente.
 */
function reclassifyPizzaAddons(result: AiResult, catalog: Catalog, turns: AiTurn[]) {
  const said = normalize(
    turns
      .filter(turn => turn.role === "user" && !turn.content.startsWith("Bebidas:"))
      .map(turn => turn.content)
      .join("\n"),
  );
  if (!said || EXPLICIT_ADDON.test(said)) return;

  for (const item of result.items) {
    if (item.kind !== "pizza" || !item.addons?.length) continue;
    const keep: string[] = [];
    const flavorTerms = [...(item.flavor_terms ?? [])];
    for (const key of item.addons) {
      const addon = catalog.addons.get(key);
      if (!addon) continue;

      const tryTerms = [addon.name, ...cheeseFlavorTerms(addon.name)];
      let pizzaKey: string | null = null;
      for (const term of tryTerms) {
        // Só promove se o cliente citou o termo (ou "queijo" para mussarela).
        const termNorm = normalize(term);
        const cited =
          said.includes(termNorm) ||
          (termNorm.includes("mussarela") && /\bqueijo\b/.test(said)) ||
          (termNorm.includes("queijo") && /\bqueijo\b/.test(said));
        if (!cited) continue;
        const matches = flavorCandidates(term, catalog);
        if (matches.length !== 1) continue;
        const entry = [...catalog.pizzas.entries()].find(([, product]) => product.id === matches[0].id);
        if (!entry || item.flavors.includes(entry[0])) continue;
        pizzaKey = entry[0];
        flavorTerms.push(term);
        break;
      }

      if (pizzaKey) item.flavors.push(pizzaKey);
      else keep.push(key);
    }
    item.addons = keep;
    item.flavor_terms = flavorTerms;
  }
}

/**
 * A IA às vezes manda um sabor do cardápio em not_found por typo (cheese/chesse).
 * Se o termo bater em um único sabor, vira pizza (tamanho null → o fluxo pergunta).
 */
function rescueNotFoundFlavors(result: AiResult, catalog: Catalog) {
  if (!result.not_found?.length) return;
  const kept: string[] = [];
  for (const raw of result.not_found) {
    const term = String(raw ?? "").trim();
    if (!term) continue;
    const matches = flavorCandidates(term, catalog);
    if (matches.length !== 1) {
      kept.push(term);
      continue;
    }
    const entry = [...catalog.pizzas.entries()].find(([, product]) => product.id === matches[0].id);
    if (!entry) {
      kept.push(term);
      continue;
    }
    const [key] = entry;
    const sizeFromItems = result.items.find(item => item.kind === "pizza" && item.size)?.size ?? null;
    result.items.push({
      kind: "pizza",
      quantity: 1,
      size: sizeFromItems,
      flavors: [key],
      flavor_terms: [term],
      product: null,
      options: [],
      crust: null,
      addons: [],
      notes: null,
    });
  }
  result.not_found = kept;
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
      const kinds = [...new Set(flavors.map(item => item.pizzaKind).filter(Boolean))];
      if (kinds.length > 1) {
        const salty = flavors.filter(item => item.pizzaKind === "salgada").map(item => cleanFlavorName(item.name));
        const sweet = flavors.filter(item => item.pizzaKind === "doce").map(item => cleanFlavorName(item.name));
        problems.push(
          `Não dá para fazer *meia a meia* misturando *salgada* e *doce* na mesma pizza. Quais sabores ficam nela?\nSalgados: *${salty.join(", ") || "—"}*\nDoces: *${sweet.join(", ") || "—"}*`,
        );
        continue;
      }
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
      } else if (!raw.crust && base.crustsEnabled && userSaidNoCrust(turns)) {
        extras.push(noCrustSelection());
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
  let storeName = "";
  try {
    const [built, store] = await Promise.all([buildCatalog(), getStore().catch(() => null)]);
    catalog = built;
    storeName = store?.name?.trim() || "";
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

  if (storeName) dropStoreNameFlavors(result, catalog, storeName);
  applySizeFollowUp(result, catalog, turns);
  mergeSinglePizzaSplit(result, catalog, turns);
  reclassifyPizzaAddons(result, catalog, turns);
  rescueNotFoundFlavors(result, catalog);
  if (storeName) dropStoreNameFlavors(result, catalog, storeName);
  applySizeFollowUp(result, catalog, turns);
  applyDefaultCrust(result, catalog, turns);
  const { items, problems, choices } = toCartItems(result, catalog, turns);
  const notFound = (result.not_found ?? []).map(item => item.trim()).filter(Boolean).slice(0, 5);
  const question =
    flavorChoiceQuestion(choices[0]) ?? problems[0] ?? sanitizeAiQuestion(result.question);
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
    hoursQuestion: Boolean(result.hours_question),
  };

  if (question) return { status: "question", question, items, ...extras };
  if (!items.length) return { status: "empty", ...extras };
  return { status: "ok", items, ...extras };
}

function drinksSystemPrompt(catalogText: string) {
  return [
    "Você identifica BEBIDAS pedidas numa conversa de WhatsApp em português, respondendo à pergunta 'Deseja uma bebida?'.",
    "Use SOMENTE os códigos do cardápio abaixo. Nunca invente itens, códigos ou preços.",
    "Regras:",
    "- Cada bebida: kind=product, product=código iN, com options quando houver opções obrigatórias ditas pelo cliente. size=null, flavors=[], crust=null, addons=[].",
    "- Pode haver várias bebidas. quantity >= 1 ('duas cocas' = quantity 2; '2x guaraná lata' = quantity 2). '2L'/'2 L'/'2 litros' é TAMANHO, não quantidade.",
    "- Leia TODA a conversa. Resposta curta ('2L', '2 L', 'lata', 'zero', 'coca') completa o que o cliente já disse. Ex.: disse 'coca cola' e depois '2 L' = Coca 2L do cardápio.",
    "- Nunca coloque tamanho/variante em not_found ('2 L', '2 litros', 'lata', 'zero').",
    "- Aceite erros de digitação e nomes aproximados ('coca 2l', 'coca zero 1l', 'guarana lata').",
    "- Só pergunte o que ainda faltar. Se marca + tamanho já existem no cardápio, feche o item (não-zero, salvo se o cliente pediu zero).",
    "- Se o cliente pedir algo vago ('um refri', 'uma coca') e houver várias opções, pergunte qual em 'question' (curta, simpática, sem códigos).",
    "- Bebidas que não existem no cardápio vão em not_found (texto curto como o cliente escreveu).",
    "- answer=null, menu_requested=false, fulfillment=null, address=null, payment=null, flavor_terms=[], fee_question=false, fee_neighborhood=null, hours_question=false.",
    "",
    "CARDÁPIO DE BEBIDAS:",
    catalogText,
  ].join("\n");
}

function compactDrink(text: string) {
  return normalize(text).replace(/[^a-z0-9]+/g, "");
}

function isDrinkSizeOnly(value: string) {
  const spaced = normalize(value).replace(/(\d)\s+l(itros?)?\b/g, "$1l");
  const compact = compactDrink(spaced);
  return /^(2l|2lt|2litros?|1l|1lt|1litro|350ml|lata|zero)$/.test(compact);
}

function drinkBrandKey(said: string) {
  const compact = compactDrink(said);
  const brands = [
    ["cocacola", "coca"],
    ["coca", "coca"],
    ["guarana", "guarana"],
    ["fanta", "fanta"],
    ["sprite", "sprite"],
    ["kuat", "kuat"],
    ["redbull", "redbull"],
    ["suco", "suco"],
    ["agua", "agua"],
  ] as const;
  for (const [needle, key] of brands) {
    if (compact.includes(needle)) return key;
  }
  return null;
}

function drinkSizeHints(said: string) {
  const spaced = normalize(said).replace(/(\d)\s+l(itros?)?\b/g, "$1l");
  const compact = compactDrink(spaced);
  return {
    twoL: /2l/.test(compact) || /\b2\s*litros?\b/.test(spaced),
    oneL: (/1l/.test(compact) || /\b1\s*litro\b/.test(spaced)) && !/2l/.test(compact),
    can: /\blata\b/.test(spaced) || /350ml/.test(compact),
    zero: /\bzero\b/.test(spaced),
  };
}

function scoreDrinkProduct(
  product: Product,
  brand: string,
  size: ReturnType<typeof drinkSizeHints>,
) {
  const name = compactDrink(product.name);
  if (!name.includes(brand) && !(brand === "coca" && name.includes("cocacola"))) return 0;
  let score = 10;
  if (size.twoL) score += /2l/.test(name) ? 25 : -12;
  if (size.oneL) score += /1l/.test(name) && !/2l/.test(name) ? 25 : -12;
  if (size.can) score += /lata|350/.test(name) ? 20 : -8;
  if (size.zero) score += name.includes("zero") ? 20 : -15;
  else if (name.includes("zero")) score -= 12;
  return score;
}

/** Junta 'coca' + '2 L' no item certo do cardápio quando a IA trata o tamanho como produto novo. */
function resolveDrinkFollowUp(result: AiResult, catalog: Catalog, turns: AiTurn[]) {
  const said = turns
    .filter(turn => turn.role === "user")
    .map(turn => turn.content.replace(/^(bebida|bebidas)\s*:\s*/i, ""))
    .join(" ");
  const brand = drinkBrandKey(said);
  const size = drinkSizeHints(said);
  if (!brand || !(size.twoL || size.oneL || size.can || size.zero)) return;

  const ranked = [...catalog.products.values()]
    .map(product => ({ product, score: scoreDrinkProduct(product, brand, size) }))
    .filter(entry => entry.score >= 30)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return;
  if (ranked[1] && ranked[1].score >= best.score - 4) return;

  const key = [...catalog.products.entries()].find(([, product]) => product.id === best.product.id)?.[0];
  if (!key) return;
  result.items = [
    {
      kind: "product",
      quantity: 1,
      size: null,
      flavors: [],
      flavor_terms: [],
      product: key,
      options: [],
      crust: null,
      addons: [],
      notes: null,
    },
  ];
  result.question = null;
  result.not_found = [];
}

/** v2: interpreta a resposta de "Deseja uma bebida?" usando só os produtos de bebida. */
export async function interpretDrinks(
  turns: AiTurn[],
  isDrink: (product: Product) => boolean,
): Promise<AiOrderOutcome> {
  let catalog: Catalog;
  try {
    catalog = await buildCatalog({ onlyProducts: isDrink });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Falha ao carregar o cardápio." };
  }

  const history = turns.slice(-8);
  let result: AiResult;
  try {
    result = await chatJson<AiResult>({
      schemaName: "bebidas",
      schema: SCHEMA as unknown as Record<string, unknown>,
      metadata: { flow: "v2-drinks" },
      messages: [{ role: "system", content: drinksSystemPrompt(catalog.text) }, ...history],
    });
  } catch (error) {
    console.error("[ai-drinks] falha na OpenAI:", error instanceof Error ? error.message : error);
    return { status: "error", message: error instanceof Error ? error.message : "Falha na IA." };
  }

  resolveDrinkFollowUp(result, catalog, history);
  result.not_found = (result.not_found ?? []).filter(item => !isDrinkSizeOnly(item));

  const { items, problems } = toCartItems(
    { ...result, items: result.items.filter(item => item.kind === "product") },
    catalog,
  );
  const notFound = (result.not_found ?? []).map(item => item.trim()).filter(Boolean).slice(0, 5);
  const lastUser = [...history].reverse().find(turn => turn.role === "user")?.content ?? "";
  const sizeQuestion =
    !items.length && isDrinkSizeOnly(lastUser)
      ? drinkSizeHints(lastUser).twoL
        ? "Qual bebida de *2 litros* você gostaria?"
        : drinkSizeHints(lastUser).oneL
          ? "Qual bebida de *1 litro* você gostaria?"
          : drinkSizeHints(lastUser).can
            ? "Qual bebida em *lata* você gostaria?"
            : "Qual bebida você gostaria?"
      : undefined;
  const question = problems[0] ?? (result.question?.trim() || sizeQuestion);
  const extras: AiOutcomeExtras = { notFound, menuRequested: false, hints: {} };

  if (question) return { status: "question", question, items, ...extras };
  if (!items.length) return { status: "empty", ...extras };
  return { status: "ok", items, ...extras };
}
