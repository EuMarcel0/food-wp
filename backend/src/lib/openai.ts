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
}): Promise<T> {
  if (!isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    };
    const message = data.choices?.[0]?.message;
    if (message?.refusal) throw new Error(`OpenAI recusou: ${message.refusal}`);
    if (!message?.content) throw new Error("OpenAI sem conteúdo na resposta.");
    return JSON.parse(message.content) as T;
  } finally {
    clearTimeout(timer);
  }
}
