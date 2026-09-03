import {
  claimCloseIdleConversation,
  getStore,
  listIdleOpenConversations,
} from "../data/repository.js";
import { sendText } from "../lib/whatsapp.js";

export const IDLE_TIMEOUT_MESSAGE =
  "⏰ Encerramos seu atendimento por falta de resposta.\nQuando quiser pedir de novo, é só mandar uma mensagem. 👋";

const CHECK_EVERY_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function sweepIdleConversations() {
  if (running) return;
  running = true;
  try {
    const store = await getStore();
    const idleMinutes = store.idleTimeoutMinutes ?? 60;
    const candidates = await listIdleOpenConversations(idleMinutes);
    for (const candidate of candidates) {
      // Fecha primeiro (atômico) para não competir com nova mensagem do cliente.
      const closed = await claimCloseIdleConversation(candidate.id, idleMinutes);
      if (!closed) continue;
      try {
        await sendText(candidate.customerPhone, IDLE_TIMEOUT_MESSAGE);
      } catch (error) {
        console.error(
          `[idle-timeout] falha ao avisar ${candidate.customerPhone}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  } catch (error) {
    console.error(
      "[idle-timeout] falha na varredura:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    running = false;
  }
}

/** Checa conversas ociosas: encerra + avisa no WhatsApp. */
export function startIdleTimeoutJob() {
  if (timer) return;
  console.log(
    `Idle timeout: checando conversas ociosas a cada ${CHECK_EVERY_MS / 1000}s`,
  );
  void sweepIdleConversations();
  timer = setInterval(() => {
    void sweepIdleConversations();
  }, CHECK_EVERY_MS);
  timer.unref?.();
}
