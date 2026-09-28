/**
 * Garante no máximo um processamento por cliente (telefone) por vez.
 * Se o bot ainda estiver respondendo, mensagens novas são ignoradas —
 * evita rajadas (ex.: vários toques na lista) gerarem respostas duplicadas.
 */
const busy = new Set<string>();

export function queueKeyForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits || phone.trim();
}

export function isUserBusy(key: string): boolean {
  return busy.has(key.trim() || "unknown");
}

export function enqueueByUser(
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const normalized = key.trim() || "unknown";
  if (busy.has(normalized)) {
    console.log(`WhatsApp: mensagem ignorada (já respondendo) key=${normalized}`);
    return Promise.resolve();
  }

  busy.add(normalized);
  return Promise.resolve()
    .then(() => task())
    .finally(() => {
      busy.delete(normalized);
    });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Como `enqueueByUser`, mas espera a vez em vez de descartar (até `maxWaitMs`). */
export async function enqueueWaitByUser(
  key: string,
  task: () => Promise<void>,
  maxWaitMs = 60_000,
): Promise<void> {
  const normalized = key.trim() || "unknown";
  const deadline = Date.now() + maxWaitMs;
  while (busy.has(normalized) && Date.now() < deadline) {
    await sleep(150);
  }
  busy.add(normalized);
  try {
    await task();
  } finally {
    busy.delete(normalized);
  }
}
