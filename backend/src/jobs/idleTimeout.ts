import {
  claimCloseIdleAfterDelivered,
  claimCloseIdleConversation,
  claimIdleWarningConversation,
  getStore,
  listIdleOpenConversations,
  listIdleWarningConversations,
} from "../data/repository.js";
import { dayPeriodWish } from "../lib/businessHours.js";
import { sendText } from "../lib/whatsapp.js";

export const IDLE_WARNING_MESSAGE =
  "👋 Ainda está aí?\nSe quiser continuar o pedido, é só responder. Em breve encerramos por falta de resposta.";

export const IDLE_TIMEOUT_MESSAGE =
  "⏰ Encerramos seu atendimento por falta de resposta.\nQuando quiser pedir de novo, é só mandar uma mensagem. 👋";

function idleDeliveredCloseMessage(timezone: string) {
  return [
    "😊 Agradecemos pela preferência!",
    "Esperamos você novamente. 🍕",
    dayPeriodWish(timezone),
  ].join("\n");
}

const CHECK_EVERY_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function sweepIdleConversations() {
  if (running) return;
  running = true;
  try {
    const store = await getStore();
    const idleMinutes = store.idleTimeoutMinutes ?? 60;

    // 1) Metade do tempo: aviso “ainda está aí?” (não na etapa pós-entrega).
    const warningCandidates = await listIdleWarningConversations(idleMinutes);
    for (const candidate of warningCandidates) {
      const claimed = await claimIdleWarningConversation(
        candidate.id,
        idleMinutes,
      );
      if (!claimed) continue;
      try {
        await sendText(candidate.customerPhone, IDLE_WARNING_MESSAGE, {
          bumpLastMessageAt: false,
        });
      } catch (error) {
        console.error(
          `[idle-timeout] falha no aviso ${candidate.customerPhone}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 2) Tempo completo.
    const candidates = await listIdleOpenConversations(idleMinutes);
    for (const candidate of candidates) {
      if (candidate.state === "awaiting_new_order") {
        const closed = await claimCloseIdleAfterDelivered(
          candidate.id,
          idleMinutes,
        );
        if (!closed) continue;
        try {
          await sendText(
            candidate.customerPhone,
            idleDeliveredCloseMessage(store.timezone),
          );
        } catch (error) {
          console.error(
            `[idle-timeout] falha na despedida ${candidate.customerPhone}:`,
            error instanceof Error ? error.message : error,
          );
        }
        continue;
      }

      const reset = await claimCloseIdleConversation(candidate.id, idleMinutes);
      if (!reset) continue;
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

/** Checa conversas ociosas: aviso na metade + encerramento no limite. */
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
