import express from "express";
import cors from "cors";
import { env, flags } from "./config/env.js";
import { webhookRouter } from "./routes/webhook.js";
import { ordersRouter } from "./routes/orders.js";
import { notificationsRouter } from "./routes/notifications.js";
import { catalogRouter } from "./routes/catalog.js";
import { legalRouter } from "./routes/legal.js";
import { checkWhatsAppToken, subscribeWhatsAppApp } from "./lib/whatsapp.js";
import { webhookStats } from "./lib/webhookStats.js";

const app = express();

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

const extraOrigins = env.frontendOrigins.map(normalizeOrigin);

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (
    normalized === "http://localhost:5173" ||
    normalized === "http://127.0.0.1:5173"
  ) {
    return true;
  }
  if (extraOrigins.includes(normalized)) return true;
  try {
    const host = new URL(normalized).hostname;
    return host.endsWith(".up.railway.app");
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    supabase: flags.supabaseReady,
    whatsapp: flags.whatsappReady,
    tokenValid: flags.whatsappReady ? await checkWhatsAppToken() : false,
    lastWebhookAt: webhookStats.lastAt,
    lastWebhookMessages: webhookStats.lastMessages,
  });
});

app.use("/legal", legalRouter);
app.use("/webhook", webhookRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api", catalogRouter);

app.listen(env.port, "0.0.0.0", () => {
  console.log(`API em http://0.0.0.0:${env.port}`);
  console.log(
    `Supabase: ${flags.supabaseReady ? "conectado" : "modo memória (preencha o .env)"}`,
  );
  console.log(
    `WhatsApp: ${flags.whatsappReady ? "pronto" : "dry-run (preencha o .env)"}`,
  );
  void subscribeWhatsAppApp();
});
