import express from "express";
import cors from "cors";
import { env, flags } from "./config/env.js";
import { webhookRouter } from "./routes/webhook.js";
import { ordersRouter } from "./routes/orders.js";
import { notificationsRouter } from "./routes/notifications.js";
import { catalogRouter } from "./routes/catalog.js";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: flags.supabaseReady,
    whatsapp: flags.whatsappReady,
  });
});

app.use("/webhook", webhookRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api", catalogRouter);

app.listen(env.port, () => {
  console.log(`API em http://localhost:${env.port}`);
  console.log(
    `Supabase: ${flags.supabaseReady ? "conectado" : "modo memória (preencha o .env)"}`,
  );
  console.log(
    `WhatsApp: ${flags.whatsappReady ? "pronto" : "dry-run (preencha o .env)"}`,
  );
});
