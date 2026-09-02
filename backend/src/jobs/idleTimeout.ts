/** Encerramento automático desativado: histórico só via "Encerrar atendimento" no painel. */
export const IDLE_TIMEOUT_MESSAGE =
  "Encerramos seu atendimento por falta de resposta. Quando quiser pedir de novo, é só mandar uma mensagem. 👋";

export function startIdleTimeoutJob() {
  console.log(
    "Idle timeout: encerramento automático desativado (use Encerrar atendimento no painel).",
  );
}
