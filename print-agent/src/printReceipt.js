import { imagePrintWindows, rawPrintWindows } from "./rawPrint.js";
import { buildReceiptEscPos } from "./receipt.js";
import { buildReceiptLayout } from "./receiptLayout.js";

/** Largura útil da bobina em pontos (203 dpi): 80 mm = 576, 58 mm = 384. */
function widthDotsFor(columns) {
  return Number(columns) >= 40 ? 576 : 384;
}

/**
 * Imprime o cupom igual à prévia do painel (imagem). Se a impressora/Windows não
 * aceitar, cai no modo texto ESC/POS antigo para o pedido nunca deixar de sair.
 * @param {string} printerName
 * @param {{ order: Record<string, unknown>; store?: Record<string, unknown>; columns: number; mode?: string; fontScale?: number }} input
 */
export async function printReceipt(printerName, input) {
  if (input.mode !== "text") {
    try {
      await imagePrintWindows(printerName, buildReceiptLayout(input), {
        widthDots: widthDotsFor(input.columns),
        fontScale: input.fontScale,
      });
      return { mode: "image" };
    } catch (error) {
      console.error(
        "[print] cupom como imagem falhou; imprimindo em texto:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  await rawPrintWindows(printerName, buildReceiptEscPos(input));
  return { mode: "text" };
}
