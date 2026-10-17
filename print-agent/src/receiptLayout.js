import {
  addonNames,
  baseUnitPriceCents,
  crustNames,
  formatBRL,
  formatCnpj,
  formatDate,
  formatPhone,
} from "./receipt.js";

/**
 * Cupom em blocos para a impressão como imagem — espelha o ReceiptTicket do painel
 * (tamanhos em px de tela; o renderizador escala para a largura da bobina).
 *
 * Cada linha: tipo \t tamanho \t negrito \t alinhamento \t recuo \t texto \t direita \t direitaNegrito \t antes \t depois
 * Tipos: T texto · F campo (texto = rótulo, direita = valor) · S título de seção ·
 *        L linha com pontilhado até o valor · R linha tracejada · V espaço (tamanho = px)
 */

const FISCAL_DISCLAIMER = "Não é válido como documento fiscal.";

const PAYMENT_LABEL = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  credit: "Crédito",
  debit: "Débito",
  mixed: "Misto",
  other: "Outro",
};

function clean(value) {
  return String(value ?? "")
    .replace(/[\t\r]/g, " ")
    .replace(/\n+/g, " ")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .trim();
}

function row(kind, { size = 12, bold = false, align = "left", indent = 0, text = "", right = "", rightBold = false, before = 0, after = 0 } = {}) {
  return [kind, size, bold ? 1 : 0, align, indent, clean(text), clean(right), rightBold ? 1 : 0, before, after].join("\t");
}

/** @param {{ store?: Record<string, unknown>; order: Record<string, unknown> }} input */
export function buildReceiptLayout(input) {
  const store = input.store ?? {};
  const order = input.order ?? {};
  const items = Array.isArray(order.items) ? order.items : [];
  const rows = [];

  const section = (label) => rows.push(row("S", { bold: true, text: label.toUpperCase(), before: 10, after: 6 }));
  const field = (label, value) => {
    const text = clean(value);
    if (text) rows.push(row("F", { text: label, right: text, after: 3 }));
  };
  const amount = (label, cents, strong = false) =>
    rows.push(row("L", { bold: true, text: label, right: formatBRL(cents), rightBold: strong, after: 2 }));

  rows.push(row("V", { size: 24 }));
  rows.push(row("T", { size: 15, bold: true, align: "center", text: store.name || "Estabelecimento" }));
  if (clean(store.legalName)) rows.push(row("T", { size: 11, align: "center", text: store.legalName, before: 2 }));
  const cnpj = formatCnpj(store.cnpj);
  if (cnpj) rows.push(row("T", { size: 11, align: "center", text: `CNPJ ${cnpj}`, before: 2 }));

  section("Pedido");
  field("Pedido", `#${order.code ?? ""}`);
  field("Data", formatDate(order.createdAt));

  section("Cliente");
  field("Nome", clean(order.customerName) || clean(order.contactName) || "Cliente");
  field("Telefone", formatPhone(order.customerPhone));
  const delivery = order.fulfillment === "delivery";
  field("Tipo", delivery ? "Entrega" : "Retirada");
  const neighborhood = delivery ? clean(order.neighborhoodName) : "";
  if (neighborhood) field("Bairro", neighborhood);
  if (delivery) field("Endereço", order.addressText);

  section("Itens do pedido");
  if (!items.length) rows.push(row("T", { text: "Sem itens", after: 4 }));
  for (const item of items) {
    const quantity = Number(item.quantity) || 1;
    const fullUnit = Number(item.unitPriceCents) || 0;
    const unit = baseUnitPriceCents(fullUnit, item.extras);
    rows.push(row("T", { bold: true, text: `${quantity}x ${item.name || "Item"}`, after: 2 }));
    rows.push(row("L", { text: `(un ${formatBRL(unit)})`, right: formatBRL(quantity * fullUnit), after: 2 }));
    const extras = [
      item.notes ? `obs.: ${item.notes}` : "",
      crustNames(item.extras).length ? `Borda: ${crustNames(item.extras).join(", ")}` : "",
      addonNames(item.extras).length ? `Adicionais: ${addonNames(item.extras).join(", ")}` : "",
    ].filter(Boolean);
    for (const text of extras) rows.push(row("T", { size: 11, indent: 8, text, before: 2 }));
    rows.push(row("V", { size: 8 }));
  }

  section("Pagamento");
  const payment =
    clean(order.paymentMethodLabel) ||
    (order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] || String(order.paymentMethod) : "");
  if (payment) field("Forma", payment);
  amount("Subtotal", order.subtotalCents);
  if (delivery) {
    amount(neighborhood ? `Taxa de entrega (${neighborhood})` : "Taxa de entrega", order.deliveryFeeCents);
  }
  amount("TOTAL", order.totalCents, true);
  if (order.paymentMethod === "cash" && order.changeForCents != null) {
    const changeFor = Number(order.changeForCents) || 0;
    const due = Math.max(0, changeFor - (Number(order.totalCents) || 0));
    rows.push(
      row("T", {
        text: changeFor ? `Troco p/ ${formatBRL(changeFor)} = ${formatBRL(due)}` : "Sem troco",
        before: 6,
      }),
    );
  }

  if (clean(order.notes)) {
    section("Observações");
    for (const line of String(order.notes).split(/\n+/)) {
      if (clean(line)) rows.push(row("T", { text: line }));
    }
  }

  if (clean(store.receiptFooter)) {
    rows.push(row("V", { size: 12 }));
    for (const line of String(store.receiptFooter).split(/\n+/)) {
      if (clean(line)) rows.push(row("T", { size: 11, align: "center", text: line }));
    }
  }

  rows.push(row("V", { size: 14 }));
  rows.push(row("R", { after: 8 }));
  rows.push(row("T", { size: 11, align: "center", text: FISCAL_DISCLAIMER }));
  rows.push(row("V", { size: 24 }));
  return rows;
}
