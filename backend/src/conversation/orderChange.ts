/**
 * v2: detecta, sem IA, quando o cliente quer modificar o pedido (adicionar/remover/trocar)
 * no meio do checkout. Só o que bater aqui vai para a IA.
 *
 * Contextos:
 * - checkout: pagamento, troco, nome, endereço, endereço salvo.
 * - drink: "Deseja uma bebida?" — adicionar bebida é a própria resposta da etapa.
 * - note: observação/adicionais — ajuste de ingrediente ("sem cebola", "tira a azeitona") é da própria etapa.
 */
export type OrderChangeContext = "checkout" | "drink" | "note";

function plainText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\+\s*1\b/g, " mais um ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Itens do cardápio (bebidas, pizza, tamanhos, borda). */
const PRODUCT =
  /\b(pizzas?|refris?|refrigerantes?|cocas?|coca cola|coca zero|guarana|fanta|kuat|sprite|sucos?|aguas?|latas?|latinhas?|litros?|\d+ ?l|\d+ ?lt|\d+ ?ml|bordas?|red bull|redbull|monster|cervejas?|bebidas?|sabor|sabores|metade|meia|broto|familia|grande|media|pequena)\b/;
const PIZZA = /\b(pizzas?|sabor|sabores|metade|meia|broto|familia|grande|media|pequena|bordas?)\b/;

const ADD =
  /\b(adiciona\w*|adicion\w*|acrescent\w*|inclui\w*|incluir|coloca mais|coloque mais|colocar mais|poe mais|bota mais|manda mais|mais (um|uma|dois|duas|tres|\d+)|faltou|esqueci|tambem quero|quero tambem|manda tambem|traz tambem|traga tambem|junto com)\b/;
/**
 * Só com produto do cardápio: "outra coca", "e um guaraná", "coloca um suco", "manda 2 cocas",
 * "quero uma coca". Exige quantidade/artigo indefinido para não pegar "quero a pizza bem passada".
 */
const ADD_WITH_PRODUCT =
  /\b(outr[oa]s?|e (um|uma|dois|duas|\d+)|e mais|(coloca|coloque|colocar|coloquem|poe|por|bota|botar|manda|mande|mandar|traz|traga|trazer|quero|queria|gostaria de|me ve|ve|inclui|pode ser|vai) (mais )?(um|uma|uns|umas|dois|duas|tres|\d+|outr[oa]s?))\b/;
const REMOVE =
  /\b(tira|tirar|tire|tirem|retira|retirar|retire|remove|remover|remova|exclui|excluir|exclua|apaga|apagar|cancela (a|o|as|os)|nao quero mais|desisti|desisto)\b/;
const REMOVE_WITH_PRODUCT = /\bsem (a|o|as|os)\b/;
const SWAP =
  /\b(troca|trocar|troque|trocamos|substitu\w*|no lugar d\w*|em vez d\w*|ao inves d\w*|muda|mudar|mude|altera\w*|corrig\w*|corrije|errei|mudei de ideia|pensando bem|na verdade)\b/;
const QTY = /\b(sao (dois|duas|tres|\d+)|aumenta\w*|diminui\w*|dobra\w*)\b/;
const GENERIC =
  /\b(mudar|muda|alterar|altera|editar|edita|modificar|modifica|corrigir|corrige|trocar|troca|mexer)( no| o| a| meu| minha)? (pedido|carrinho)\b/;

/** Frases comuns que usam as mesmas palavras sem ser alteração do pedido. */
const FALSE_POSITIVE =
  /\b(mais ou menos|mais rapido|mais tarde|mais cedo|mais nada|nada mais|so isso|troco|sem troco)\b/;
/** Mudança de pagamento/entrega/endereço — tratada pela própria etapa. */
const CHECKOUT_WORDS =
  /\b(pix|cartao|credito|debito|dinheiro|especie|retirada|retirar ai|vou buscar|buscar ai|busco|entrega|entregar|endereco|rua|avenida|av|travessa|bairro|numero|casa|apto|apartamento|quadra|lote|condominio|nome)\b/;
/** "uma coca 2l", "2 guaraná lata" digitado solto numa etapa do checkout. */
const BARE_ITEM = /^(e |mais )?(\d+|um|uma|dois|duas|tres)\s/;

export function looksLikeOrderChange(text: string, context: OrderChangeContext) {
  const plain = plainText(text);
  if (!plain || plain.length < 3) return false;
  if (GENERIC.test(plain)) return true;

  const hasProduct = PRODUCT.test(plain);
  if (!hasProduct && FALSE_POSITIVE.test(plain)) return false;
  if (!hasProduct && CHECKOUT_WORDS.test(plain)) return false;

  const add = ADD.test(plain) || (hasProduct && ADD_WITH_PRODUCT.test(plain));
  const remove = REMOVE.test(plain) || (hasProduct && REMOVE_WITH_PRODUCT.test(plain));
  const swap = SWAP.test(plain);
  const qty = QTY.test(plain);

  if (context === "note") {
    return hasProduct && (add || remove || swap || qty);
  }
  if (context === "drink") {
    // Adicionar bebida responde a própria etapa; só desvia para remover/trocar ou mexer em pizza.
    return remove || swap || qty || (add && PIZZA.test(plain));
  }
  if (add || remove || swap || qty) return true;
  return context === "checkout" && hasProduct && BARE_ITEM.test(plain);
}
