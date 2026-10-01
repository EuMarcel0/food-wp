import { env } from "../config/env.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 25_000;

export function isOpenAiConfigured() {
  return Boolean(env.openaiApiKey && !env.openaiApiKey.startsWith("your-"));
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Chat Completions com saída estruturada (JSON Schema estrito).
 * Retorna o objeto já parseado ou lança erro (timeout, HTTP, JSON inválido).
 */
export async function chatJson<T>(input: {
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  /** Aparece nos Logs da OpenAI (platform.openai.com/logs) para filtrar as chamadas. */
  metadata?: Record<string, string>;
}): Promise<T> {
  if (!isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: input.temperature ?? 0,
        messages: input.messages,
        ...(env.openaiStoreLogs ? { store: true, metadata: { app: "food-wp-bot", ...input.metadata } } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = JSON.parse(text) as {
      id?: string;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    };
    console.info(
      `[openai] ${input.schemaName} id=${data.id ?? "?"} model=${data.model ?? env.openaiModel} ` +
        `tokens=${data.usage?.prompt_tokens ?? 0}+${data.usage?.completion_tokens ?? 0}=${data.usage?.total_tokens ?? 0} ` +
        `${Date.now() - startedAt}ms`,
    );
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new Error(`OpenAI recusou: ${message.refusal}`);
    if (!message?.content) throw new Error("OpenAI sem conteúdo na resposta.");
    return JSON.parse(message.content) as T;
  } finally {
    clearTimeout(timer);
  }
}

const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

/** Transcreve um áudio (ogg/opus do WhatsApp, mp3, m4a…) em português. */
export async function transcribeAudio(input: {
  bytes: Buffer;
  mime: string;
  fileName: string;
  /** Vocabulário esperado (nomes do cardápio) para melhorar a precisão. */
  prompt?: string;
}): Promise<string> {
  if (!isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  const mime = input.mime.split(";")[0]?.trim() || "audio/ogg";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.bytes)], { type: mime }), input.fileName);
  form.append("model", env.openaiTranscribeModel);
  form.append("language", "pt");
  form.append("response_format", "json");
  if (input.prompt) form.append("prompt", input.prompt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.openaiApiKey}` },
      body: form,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = JSON.parse(text) as { text?: string };
    const transcript = (data.text ?? "").trim();
    console.info(
      `[openai] transcrição model=${env.openaiTranscribeModel} bytes=${input.bytes.length} ` +
        `chars=${transcript.length} ${Date.now() - startedAt}ms`,
    );
    return transcript;
  } finally {
    clearTimeout(timer);
  }
}
