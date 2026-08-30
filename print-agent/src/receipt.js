/** Largura típica 80mm ESC/POS. */

const ESC = 0x1b;
const GS = 0x1d;

function encodeText(text) {
  // Code page 850 / Latin-1 aproximado para acentuação PT-BR em térmicas.
  const normalized = String(text ?? "")
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

function formatBRL(cents) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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
  const dash = () => emit("-".repeat(columns));

  chunks.push(Buffer.from([ESC, 0x40])); // init
  chunks.push(Buffer.from([ESC, 0x61, 1])); // center

  emit(store.name || "Estabelecimento");
  if (store.legalName) emit(String(store.legalName));
  if (store.cnpj) emit(`CNPJ ${store.cnpj}`);

  chunks.push(Buffer.from([ESC, 0x61, 0])); // left
  dash();
  chunks.push(Buffer.from([ESC, 0x45, 1])); // bold on
  emit(`Pedido #${order.code ?? ""}`);
  chunks.push(Buffer.from([ESC, 0x45, 0]));
  emit(formatDate(order.createdAt));

  const customer = [order.customerName, formatPhone(order.customerPhone)]
    .filter(Boolean)
    .join(" · ");
  if (customer) emit(customer);

  const fulfillment = order.fulfillment === "delivery" ? "Entrega" : "Retirada";
  const payment = order.paymentMethod
    ? PAYMENT[order.paymentMethod] || String(order.paymentMethod)
    : "";
  emit(payment ? `${fulfillment} · ${payment}` : fulfillment);
  if (order.fulfillment === "delivery" && order.neighborhoodName) {
    emit(`Bairro: ${order.neighborhoodName}`);
  }
  if (order.fulfillment === "delivery" && order.addressText) {
    for (const row of wrap(String(order.addressText), columns)) emit(row);
  }

  dash();

  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const unit = Number(item.unitPriceCents) || 0;
    const total = qty * unit;
    const title = `${qty}x ${item.name || "Item"}`;
    for (const row of wrap(title, columns)) emit(row);
    emit(line(columns, `(un ${formatBRL(unit)})`, formatBRL(total)));
    if (item.notes) {
      for (const row of wrap(`obs.: ${item.notes}`, columns)) emit(row);
    }
    const crust = crustNames(item.extras);
    if (crust.length) {
      for (const row of wrap(`Borda: ${crust.join(", ")}`, columns)) emit(row);
    }
    const addons = addonNames(item.extras);
    if (addons.length) {
      for (const row of wrap(`Adicionais: ${addons.join(", ")}`, columns)) {
        emit(row);
      }
    }
    emit("");
  }

  dash();
  emit(line(columns, "Subtotal", formatBRL(order.subtotalCents)));
  if (order.fulfillment === "delivery") {
    const feeLabel = order.neighborhoodName
      ? `Taxa (${order.neighborhoodName})`
      : "Taxa de entrega";
    emit(line(columns, feeLabel, formatBRL(order.deliveryFeeCents)));
  }
  chunks.push(Buffer.from([ESC, 0x45, 1]));
  emit(line(columns, "Total", formatBRL(order.totalCents)));
  chunks.push(Buffer.from([ESC, 0x45, 0]));

  if (order.paymentMethod === "cash" && order.changeForCents != null) {
    const changeFor = Number(order.changeForCents) || 0;
    if (!changeFor) emit("Sem troco");
    else {
      const due = Math.max(0, changeFor - Number(order.totalCents || 0));
      emit(`Troco p/ ${formatBRL(changeFor)} = ${formatBRL(due)}`);
    }
  }

  if (order.notes) {
    dash();
    for (const row of wrap(`Obs. da entrega: ${order.notes}`, columns)) emit(row);
  }
  if (store.receiptFooter) {
    dash();
    chunks.push(Buffer.from([ESC, 0x61, 1]));
    for (const row of wrap(String(store.receiptFooter), columns)) emit(row);
    chunks.push(Buffer.from([ESC, 0x61, 0]));
  }

  emit("");
  emit("");
  // Full cut
  chunks.push(Buffer.from([GS, 0x56, 0x00]));

  return push(...chunks);
}
