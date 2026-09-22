/** Largura típica 80mm ESC/POS. */

const ESC = 0x1b;
const GS = 0x1d;

const FISCAL_DISCLAIMER = "Nao e valido como documento fiscal.";

function encodeText(text) {
  // Térmicas ESC/POS costumam falhar com NBSP/unicode — vira "?".
  const normalized = String(text ?? "")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
  return Buffer.from(normalized, "ascii");
}

function push(...parts) {
  return Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part))));
}

function line(columns, left, right = "") {
  const L = String(left ?? "");
  const R = String(right ?? "");
  if (!R) {
    return L.length <= columns ? L : `${L.slice(0, columns - 1)}.`;
  }
  const gap = 1;
  const maxLeft = columns - R.length - gap;
  const clipped =
    L.length <= maxLeft ? L : `${L.slice(0, Math.max(0, maxLeft - 1))}.`;
  const spaces = Math.max(gap, columns - clipped.length - R.length);
  return `${clipped}${" ".repeat(spaces)}${R}`;
}

function wrap(text, columns) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rows = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= columns) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    if (word.length <= columns) {
      current = word;
    } else {
      for (let i = 0; i < word.length; i += columns) {
        rows.push(word.slice(i, i + columns));
      }
      current = "";
    }
  }
  if (current) rows.push(current);
  return rows;
}

function sectionTitle(columns, label) {
  const text = ` ${String(label).trim()} `;
  if (text.length >= columns) return text.slice(0, columns);
  const dashCount = columns - text.length;
  const left = Math.floor(dashCount / 2);
  const right = dashCount - left;
  return `${"-".repeat(left)}${text}${"-".repeat(right)}`;
}

function formatBRL(cents) {
  const value = Number(cents || 0) / 100;
  // ASCII puro: evita NBSP do toLocaleString ("R$\u00A077,00" → "R$?77,00").
  const [intPart, decPart = "00"] = value.toFixed(2).split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withDots},${decPart}`;
}

function formatPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const local =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  const subscriber = local.slice(2);
  if (local.length === 11 && subscriber.startsWith("9")) {
    return `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
  }
  if (local.length === 10) {
    return `(${ddd}) 9 ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  }
  return raw;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** Sempre DD/MM/YYYY HH:mm no fuso de Brasília (evita ISO/locale do Node). */
function formatDate(iso) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso ?? "");
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
    const day = get("day");
    const month = get("month");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    if (day && month && year) {
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    const local = new Date(
      date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
    );
    return `${pad2(local.getDate())}/${pad2(local.getMonth() + 1)}/${local.getFullYear()} ${pad2(local.getHours())}:${pad2(local.getMinutes())}`;
  } catch {
    return String(iso ?? "");
  }
}

const PAYMENT = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartao",
  credit: "Credito",
  debit: "Debito",
  other: "Outro",
};

function addonNames(extras) {
  return (extras ?? [])
    .filter((item) => item.groupId === "__addon__")
    .flatMap((item) => (item.options ?? []).map((opt) => opt.name).filter(Boolean));
}

function crustNames(extras) {
  return (extras ?? [])
    .filter((item) => item.groupId === "__crust__")
    .flatMap((item) => (item.options ?? []).map((opt) => opt.name).filter(Boolean));
}

/**
 * @param {{
 *   store?: { name?: string; legalName?: string | null; cnpj?: string | null; receiptFooter?: string | null };
 *   order: Record<string, unknown>;
 *   columns?: number;
 * }} input
 */
export function buildReceiptEscPos(input) {
  const columns = Math.min(48, Math.max(32, Number(input.columns) || 42));
  const store = input.store ?? {};
  const order = input.order ?? {};
  const items = Array.isArray(order.items) ? order.items : [];
  const chunks = [];

  const emit = (text = "") => {
    chunks.push(encodeText(`${text}\n`));
  };

  // init + negrito + fonte 2x (largura e altura) — proporcional, sem line spacing extra
  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(Buffer.from([ESC, 0x45, 1])); // bold on
  chunks.push(Buffer.from([GS, 0x21, 0x11])); // double width + double height
  // Com largura dupla, cabem ~metade dos caracteres por linha.
  const textColumns = Math.max(16, Math.floor(columns / 2));
  const section = (label) => emit(sectionTitle(textColumns, label));

  // ~60px de margem no topo (alimentação em branco)
  emit("");
  emit("");
  emit("");

  chunks.push(Buffer.from([ESC, 0x61, 1])); // center
  emit(store.name || "Estabelecimento");
  if (store.legalName) emit(String(store.legalName));
  if (store.cnpj) emit(`CNPJ ${store.cnpj}`);

  chunks.push(Buffer.from([ESC, 0x61, 0])); // left
  emit("");
  section("Pedido");
  emit(`Pedido #${order.code ?? ""}`);
  emit(formatDate(order.createdAt));

  emit("");
  section("Cliente");
  const customerName =
    String(order.contactName ?? order.customerName ?? "").trim() ||
    "Cliente";
  emit(customerName);
  const phone = formatPhone(order.customerPhone);
  if (phone) emit(phone);
  const fulfillment = order.fulfillment === "delivery" ? "Entrega" : "Retirada";
  emit(`Tipo: ${fulfillment}`);
  if (order.fulfillment === "delivery" && order.neighborhoodName) {
    emit(`Bairro: ${order.neighborhoodName}`);
  }
  if (order.fulfillment === "delivery" && order.addressText) {
    for (const row of wrap(String(order.addressText), textColumns)) emit(row);
  }

  emit("");
  section("Itens do pedido");
  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const unit = Number(item.unitPriceCents) || 0;
    const total = qty * unit;
    const title = `${qty}x ${item.name || "Item"}`;
    for (const row of wrap(title, textColumns)) emit(row);
    emit(line(textColumns, `(un ${formatBRL(unit)})`, formatBRL(total)));
    if (item.notes) {
      for (const row of wrap(`obs.: ${item.notes}`, textColumns)) emit(row);
    }
    const crust = crustNames(item.extras);
    if (crust.length) {
      for (const row of wrap(`Borda: ${crust.join(", ")}`, textColumns)) emit(row);
    }
    const addons = addonNames(item.extras);
    if (addons.length) {
      for (const row of wrap(`Adicionais: ${addons.join(", ")}`, textColumns)) {
        emit(row);
      }
    }
    emit("");
  }

  section("Pagamento");
  const paymentLabel =
    (typeof order.paymentMethodLabel === "string" &&
      order.paymentMethodLabel.trim()) ||
    "";
  const payment =
    paymentLabel ||
    (order.paymentMethod
      ? PAYMENT[order.paymentMethod] || String(order.paymentMethod)
      : "");
  if (payment) emit(`Forma: ${payment}`);
  emit(line(textColumns, "Subtotal", formatBRL(order.subtotalCents)));
  if (order.fulfillment === "delivery") {
    const feeLabel = order.neighborhoodName
      ? `Taxa (${order.neighborhoodName})`
      : "Taxa de entrega";
    emit(line(textColumns, feeLabel, formatBRL(order.deliveryFeeCents)));
  }
  emit(line(textColumns, "TOTAL", formatBRL(order.totalCents)));

  if (order.paymentMethod === "cash" && order.changeForCents != null) {
    const changeFor = Number(order.changeForCents) || 0;
    if (!changeFor) emit("Sem troco");
    else {
      const due = Math.max(0, changeFor - Number(order.totalCents || 0));
      emit(`Troco p/ ${formatBRL(changeFor)} = ${formatBRL(due)}`);
    }
  }

  if (order.notes) {
    emit("");
    section("Observacoes");
    for (const row of wrap(String(order.notes), textColumns)) emit(row);
  }

  if (store.receiptFooter) {
    emit("");
    chunks.push(Buffer.from([ESC, 0x61, 1]));
    for (const row of wrap(String(store.receiptFooter), textColumns)) emit(row);
    chunks.push(Buffer.from([ESC, 0x61, 0]));
  }

  emit("");
  chunks.push(Buffer.from([ESC, 0x61, 1]));
  chunks.push(Buffer.from([GS, 0x21, 0x00])); // normal size for disclaimer
  for (const row of wrap(FISCAL_DISCLAIMER, columns)) emit(row);
  chunks.push(Buffer.from([ESC, 0x61, 0]));
  chunks.push(Buffer.from([ESC, 0x45, 0])); // bold off

  // ~60px de margem na base antes do corte
  emit("");
  emit("");
  emit("");
  chunks.push(Buffer.from([GS, 0x56, 0x00])); // full cut

  return push(...chunks);
}
