import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../.env") });

function read(name: string, fallback = "") {
  return (process.env[name] ?? fallback).trim();
}

function isPlaceholder(value: string) {
  return !value || value.startsWith("your-") || value.includes("your-project-id");
}

export const env = {
  port: Number(read("PORT", "4000")),
  nodeEnv: read("NODE_ENV", "development"),
  supabaseUrl: read("SUPABASE_URL"),
  supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  whatsappToken: read("WHATSAPP_TOKEN"),
  whatsappPhoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappVerifyToken: read("WHATSAPP_VERIFY_TOKEN", "food-wp-verify"),
  whatsappAppSecret: read("WHATSAPP_APP_SECRET"),
  whatsappAppId: read("WHATSAPP_APP_ID"),
  whatsappGraphVersion: read("WHATSAPP_GRAPH_VERSION", "v21.0"),
  whatsappWabaId: read("WHATSAPP_WABA_ID"),
  /** Tarifa (BRL) por mensagem paga, usada quando a API da Meta devolve custo 0. */
  metaPrices: {
    SERVICE: Number(read("META_PRICE_SERVICE", "0.035")),
    MARKETING: Number(read("META_PRICE_MARKETING", "0")),
    UTILITY: Number(read("META_PRICE_UTILITY", "0")),
    AUTHENTICATION: Number(read("META_PRICE_AUTHENTICATION", "0")),
  } as Record<string, number>,

  openaiApiKey: read("OPENAI_API_KEY"),
  openaiModel: read("OPENAI_MODEL", "gpt-4.1-mini"),
  /** Transcrição dos áudios dos clientes (v2). */
  openaiTranscribeModel: read("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe"),
  /** Guarda as chamadas nos Logs da OpenAI (platform.openai.com/logs). Desligue com OPENAI_STORE_LOGS=false. */
  openaiStoreLogs: read("OPENAI_STORE_LOGS", "true").toLowerCase() !== "false",
  /** Admin key (sk-admin-...) só para ler consumo/custos da organização em Configurações. */
  openaiAdminKey: read("OPENAI_ADMIN_KEY"),
  /** Opcional: limita o consumo exibido a um projeto (proj_...). */
  openaiProjectId: read("OPENAI_PROJECT_ID"),

  defaultStoreId: read("DEFAULT_STORE_ID", "00000000-0000-0000-0000-000000000001"),
  frontendOrigins: read("FRONTEND_ORIGIN")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export const flags = {
  supabaseReady:
    !isPlaceholder(env.supabaseUrl) && !isPlaceholder(env.supabaseServiceRoleKey),
  whatsappReady:
    !isPlaceholder(env.whatsappToken) && !isPlaceholder(env.whatsappPhoneNumberId),
};
