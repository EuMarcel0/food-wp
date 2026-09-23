/** Relatório ESC/POS — vendas por forma de pagamento. */

const ESC = 0x1b;
const GS = 0x1d;

function encodeText(text) {
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

function formatBRL(cents) {
  const value = Number(cents || 0) / 100;
  const [intPart, decPart = "00"] = value.toFixed(2).split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withDots},${decPart}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(iso) {
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
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
  } catch {
    return String(iso ?? "");
  }
}

function formatDay(isoOrDay) {
  const raw = String(isoOrDay ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("day")}/${get("month")}/${get("year")}`;
  } catch {
    return raw;
  }
}

/**
 * @param {{
 *   store?: { name?: string };
 *   report: {
 *     fromDay?: string | null;
 *     toDay?: string | null;
 *     paymentFilterLabel?: string | null;
 *     summary?: Array<{ paymentMethodLabel: string; orderCount: number; totalCents: number }>;
 *     orders?: Array<{
 *       code: string;
 *       createdAt: string;
 *       displayPaymentLabel: string;
 *       totalCents: number;
 *       customerName?: string | null;
 *     }>;
 *     totals?: { orderCount: number; totalCents: number };
 *   };
 *   columns?: number;
 * }} input
 */
export function buildSalesByPaymentEscPos(input) {
  const columns = Math.min(48, Math.max(32, Number(input.columns) || 48));
  const store = input.store ?? {};
  const report = input.report ?? {};
  const summary = Array.isArray(report.summary) ? report.summary : [];
  const orders = Array.isArray(report.orders) ? report.orders : [];
  const totals = report.totals ?? { orderCount: 0, totalCents: 0 };
  const chunks = [];

  const emit = (text = "") => {
    chunks.push(encodeText(`${text}\n`));
  };
  const setBold = (on) => {
    chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0]));
  };

  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(Buffer.from([ESC, 0x4d, 0]));
  chunks.push(Buffer.from([GS, 0x21, 0x00]));
  setBold(false);

  emit("");
  chunks.push(Buffer.from([ESC, 0x61, 1]));
  setBold(true);
  emit(store.name || "Estabelecimento");
  emit("Vendas por pagamento");
  setBold(false);
  chunks.push(Buffer.from([ESC, 0x61, 0]));
  emit("");

  const fromLabel = formatDay(report.fromDay);
  const toLabel = formatDay(report.toDay);
  setBold(true);
  chunks.push(encodeText("Periodo: "));
  setBold(false);
  emit(fromLabel && toLabel ? `${fromLabel} a ${toLabel}` : fromLabel || toLabel || "-");

  if (report.paymentFilterLabel) {
    setBold(true);
    chunks.push(encodeText("Filtro: "));
    setBold(false);
    emit(String(report.paymentFilterLabel));
  }

  emit("");
  setBold(true);
  emit("--- Resumo ---");
  setBold(false);
  for (const row of summary) {
    setBold(true);
    emit(String(row.paymentMethodLabel || "Sem pagamento"));
    setBold(false);
    emit(line(columns, `${row.orderCount} ped.`, formatBRL(row.totalCents)));
  }
  emit("");
  setBold(true);
  emit(line(columns, `TOTAL (${totals.orderCount})`, formatBRL(totals.totalCents)));
  setBold(false);

  emit("");
  setBold(true);
  emit("--- Pedidos ---");
  setBold(false);
  for (const order of orders) {
    setBold(true);
    chunks.push(encodeText(`#${order.code} `));
    setBold(false);
    emit(formatDateTime(order.createdAt));
    const name = String(order.customerName ?? "").trim();
    if (name) emit(name);
    emit(
      line(
        columns,
        String(order.displayPaymentLabel || "-"),
        formatBRL(order.totalCents),
      ),
    );
    emit("");
  }

  if (!orders.length) {
    emit("(nenhum pedido no periodo)");
    emit("");
  }

  setBold(true);
  emit(line(columns, "TOTAL", formatBRL(totals.totalCents)));
  setBold(false);

  emit("");
  emit(`Emitido ${pad2(new Date().getDate())}/${pad2(new Date().getMonth() + 1)}/${new Date().getFullYear()}`);
  emit("");
  emit("");
  chunks.push(Buffer.from([GS, 0x56, 0x00]));

  return push(...chunks);
}
