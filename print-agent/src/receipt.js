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

/** CNPJ só dígitos → 00.000.000/0000-00 (igual ao painel). */
function formatCnpj(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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
  const columns = Math.min(48, Math.max(32, Number(input.columns) || 48));
  const store = input.store ?? {};
  const order = input.order ?? {};
  const items = Array.isArray(order.items) ? order.items : [];
  const chunks = [];

  const emit = (text = "") => {
    chunks.push(encodeText(`${text}\n`));
  };

  const setBold = (on) => {
    chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0]));
  };

  const setSize = (width, height) => {
    const w = Math.min(7, Math.max(0, width | 0));
    const h = Math.min(7, Math.max(0, height | 0));
    chunks.push(Buffer.from([GS, 0x21, (w << 4) | h]));
  };

  /** Label em negrito + valor normal (quebra linhas longas). */
  const emitField = (label, value) => {
    const v = String(value ?? "").trim();
    if (!v) return;
    const prefix = `${label}: `;
    setBold(true);
    chunks.push(encodeText(prefix));
    setBold(false);
    const firstCols = Math.max(4, columns - prefix.length);
    const words = v.split(/\s+/).filter(Boolean);
    let current = "";
    let first = true;
    const flush = () => {
      if (!current) return;
      if (first) {
        chunks.push(encodeText(`${current}\n`));
        first = false;
      } else {
        emit(current);
      }
      current = "";
    };
    for (const word of words) {
      const limit = first ? firstCols : columns;
      const next = current ? `${current} ${word}` : word;
      if (next.length <= limit) {
        current = next;
        continue;
      }
      flush();
      if (word.length <= columns) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += columns) {
          const slice = word.slice(i, i + columns);
          if (first) {
            chunks.push(encodeText(`${slice}\n`));
            first = false;
          } else {
            emit(slice);
          }
        }
      }
    }
    flush();
    if (first) chunks.push(encodeText("\n"));
  };

  /** Linha esquerda/direita: label bold, valor normal. */
  const emitAmountLine = (label, amountCents, { strong = false } = {}) => {
    const right = formatBRL(amountCents);
    const left = String(label);
    const gap = 1;
    const maxLeft = columns - right.length - gap;
    const clipped =
      left.length <= maxLeft
        ? left
        : `${left.slice(0, Math.max(0, maxLeft - 1))}.`;
    const spaces = Math.max(gap, columns - clipped.length - right.length);
    setBold(true);
    chunks.push(encodeText(clipped));
    setBold(false);
    if (strong) setBold(true);
    chunks.push(encodeText(`${" ".repeat(spaces)}${right}\n`));
    if (strong) setBold(false);
  };

  const section = (label) => {
    setBold(true);
    emit(sectionTitle(columns, label));
    setBold(false);
  };

  // Init: fonte A (mais legível), tamanho 1x — o 2x deixava tudo “quadrado” e enorme.
  // Térmicas não carregam fonte TrueType; tamanho nativo = traço mais limpo.
  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(Buffer.from([ESC, 0x4d, 0])); // Font A
  setSize(0, 0);
  setBold(false);

  // ~60px de margem no topo
  emit("");
  emit("");
  emit("");

  // Cabeçalho: nome um pouco maior (só altura 2x), sem negrito global
  chunks.push(Buffer.from([ESC, 0x61, 1])); // center
  setSize(0, 1);
  setBold(true);
  emit(store.name || "Estabelecimento");
  setBold(false);
  setSize(0, 0);
  if (store.legalName) emit(String(store.legalName));
  const cnpj = formatCnpj(store.cnpj);
  if (cnpj) emit(`CNPJ ${cnpj}`);

  chunks.push(Buffer.from([ESC, 0x61, 0])); // left
  emit("");
  section("Pedido");
  emitField("Pedido", `#${order.code ?? ""}`);
  emitField("Data", formatDate(order.createdAt));

  emit("");
  section("Cliente");
  const customerName =
    String(order.contactName ?? order.customerName ?? "").trim() ||
    "Cliente";
  emitField("Nome", customerName);
  const phone = formatPhone(order.customerPhone);
  if (phone) emitField("Telefone", phone);
  const fulfillment = order.fulfillment === "delivery" ? "Entrega" : "Retirada";
  emitField("Tipo", fulfillment);
  if (order.fulfillment === "delivery" && order.neighborhoodName) {
    emitField("Bairro", order.neighborhoodName);
  }
  if (order.fulfillment === "delivery" && order.addressText) {
    emitField("Endereco", order.addressText);
  }

  emit("");
  section("Itens do pedido");
  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const unit = Number(item.unitPriceCents) || 0;
    const total = qty * unit;
    // Título do item em negrito; preço unitário/total em normal
    setBold(true);
    for (const row of wrap(`${qty}x ${item.name || "Item"}`, columns)) {
      emit(row);
    }
    setBold(false);
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
  if (payment) emitField("Forma", payment);
  emitAmountLine("Subtotal", order.subtotalCents);
  if (order.fulfillment === "delivery") {
    const feeLabel = order.neighborhoodName
      ? `Taxa (${order.neighborhoodName})`
      : "Taxa de entrega";
    emitAmountLine(feeLabel, order.deliveryFeeCents);
  }
  emitAmountLine("TOTAL", order.totalCents, { strong: true });

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
    for (const row of wrap(String(order.notes), columns)) emit(row);
  }

  if (store.receiptFooter) {
    emit("");
    chunks.push(Buffer.from([ESC, 0x61, 1]));
    for (const row of wrap(String(store.receiptFooter), columns)) emit(row);
    chunks.push(Buffer.from([ESC, 0x61, 0]));
  }

  emit("");
  chunks.push(Buffer.from([ESC, 0x61, 1]));
  setSize(0, 0);
  setBold(false);
  for (const row of wrap(FISCAL_DISCLAIMER, columns)) emit(row);
  chunks.push(Buffer.from([ESC, 0x61, 0]));

  emit("");
  emit("");
  emit("");
  chunks.push(Buffer.from([GS, 0x56, 0x00])); // full cut

  return push(...chunks);
}
