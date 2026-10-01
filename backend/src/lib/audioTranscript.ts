import { getStore, listProducts } from "../data/repository.js";
import { isOpenAiConfigured, transcribeAudio } from "./openai.js";

/** Áudios mais longos que isso não são transcritos (o bot segue como antes). */
const MAX_AUDIO_SECONDS = 120;
/** Fallback quando a duração não pode ser lida do arquivo. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const PROMPT_CACHE_MS = 5 * 60 * 1000;
const PROMPT_MAX_CHARS = 700;

let promptCache: { value: string; at: number } | null = null;

/** Duração de um OGG/Opus (nota de voz do WhatsApp) pela granule position da última página. */
export function oggOpusDurationSeconds(bytes: Buffer): number | null {
  if (bytes.length < 28 || bytes.toString("latin1", 0, 4) !== "OggS") return null;
  const last = bytes.lastIndexOf("OggS", bytes.length - 4, "latin1");
  if (last < 0 || last + 14 > bytes.length) return null;
  const granule = bytes.readBigInt64LE(last + 6);
  if (granule <= 0n) return null;
  return Number(granule) / 48_000;
}

async function vocabularyPrompt() {
  if (promptCache && Date.now() - promptCache.at < PROMPT_CACHE_MS) return promptCache.value;
  const [store, products] = await Promise.all([getStore(), listProducts()]);
  const names = [...new Set(products.filter(p => p.active).map(p => p.name.trim()).filter(Boolean))];
  let value = `Cliente fazendo pedido de delivery na ${store.name}. Itens do cardápio: `;
  for (const name of names) {
    if (value.length + name.length + 2 > PROMPT_MAX_CHARS) break;
    value += `${name}, `;
  }
  value = value.replace(/, $/, ".");
  promptCache = { value, at: Date.now() };
  return value;
}

/** Ativa só na v2 com OpenAI configurada. */
export async function canTranscribeCustomerAudio() {
  if (!isOpenAiConfigured()) return false;
  const store = await getStore();
  return store.botFlowVersion === "v2";
}

/** Retorna o texto do áudio do cliente, ou null se longo demais/vazio/falhou. */
export async function transcribeCustomerAudio(input: {
  bytes: Buffer;
  mime: string;
  fileName: string;
}): Promise<string | null> {
  const seconds = oggOpusDurationSeconds(input.bytes);
  if (seconds != null ? seconds > MAX_AUDIO_SECONDS : input.bytes.length > MAX_AUDIO_BYTES) {
    console.info(
      `[audio] não transcrito: longo demais (${seconds != null ? `${Math.round(seconds)}s` : `${input.bytes.length} bytes`})`,
    );
    return null;
  }
  try {
    const prompt = await vocabularyPrompt().catch(() => undefined);
    const text = await transcribeAudio({ ...input, prompt });
    return text.replace(/\s+/g, " ").trim() || null;
  } catch (error) {
    console.warn("[audio] falha na transcrição:", error instanceof Error ? error.message : error);
    return null;
  }
}
