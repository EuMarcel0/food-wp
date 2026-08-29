/**
 * Serializa tarefas por chave (ex.: telefone WhatsApp).
 * Mensagens do mesmo cliente rodam uma após a outra; clientes diferentes em paralelo.
 */
const chains = new Map<string, Promise<void>>();

export function queueKeyForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits || phone.trim();
}

export function enqueueByUser(
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const normalized = key.trim() || "unknown";
  const prev = chains.get(normalized) ?? Promise.resolve();
  const next = prev
    .catch(() => {
      /* falha anterior não bloqueia a fila */
    })
    .then(() => task())
    .finally(() => {
      if (chains.get(normalized) === next) {
        chains.delete(normalized);
      }
    });
  chains.set(normalized, next);
  return next;
}
