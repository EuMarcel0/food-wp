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
  whatsappGraphVersion: read("WHATSAPP_GRAPH_VERSION", "v21.0"),
  whatsappWabaId: read("WHATSAPP_WABA_ID"),
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
