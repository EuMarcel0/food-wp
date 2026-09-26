export function formatBRL(cents: number) {
  return formatReais(cents / 100);
}

export function formatReais(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function createOrderCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * Recalcula "troco para" (changeForCents) quando o total do pedido muda.
 * - Sem troco (0): permanece 0
 * - Pagamento exato no total anterior: acompanha o novo total
 * - Cédula menor que o novo total: sobe para o total (mínimo válido)
 * - Cédula maior: mantém; o troco devido muda com o total
 */
export function recalculateCashChangeForCents(input: {
  paymentMethod: string | null | undefined;
  previousChangeForCents: number | null | undefined;
  previousTotalCents: number;
  nextTotalCents: number;
}): number | null {
  if (input.paymentMethod !== "cash") return null;
  const previous = input.previousChangeForCents;
  if (previous == null) return null;
  const prev = Math.max(0, Math.round(Number(previous) || 0));
  const nextTotal = Math.max(0, Math.round(Number(input.nextTotalCents) || 0));
  const prevTotal = Math.max(0, Math.round(Number(input.previousTotalCents) || 0));
  if (prev === 0) return 0;
  if (prev === prevTotal) return nextTotal;
  if (prev < nextTotal) return nextTotal;
  return prev;
}
