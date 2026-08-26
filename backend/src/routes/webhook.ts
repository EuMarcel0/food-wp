import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { handleIncomingMessage } from "../conversation/engine.js";

export const webhookRouter = Router();

type WhatsAppChange = {
  value?: {
    messages?: Array<{
      from: string;
      type?: string;
      text?: { body?: string };
      interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string };
      };
    }>;
    contacts?: Array<{ profile?: { name?: string } }>;
  };
};

webhookRouter.get("/whatsapp", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (mode === "subscribe" && token === env.whatsappVerifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

function validSignature(rawBody: string | undefined, header: string | undefined) {
  if (!env.whatsappAppSecret || env.whatsappAppSecret.startsWith("your-")) {
    return true;
  }
  if (!rawBody || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.whatsappAppSecret)
    .update(rawBody)
    .digest("hex");
  const received = header.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

webhookRouter.post("/whatsapp", (req, res) => {
  const rawBody = (req as typeof req & { rawBody?: string }).rawBody;
  if (!validSignature(rawBody, req.header("x-hub-signature-256"))) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);

  const entries = (req.body?.entry ?? []) as Array<{ changes?: WhatsAppChange[] }>;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      const name = change.value?.contacts?.[0]?.profile?.name;
      for (const message of messages) {
        const replyId =
          message.interactive?.button_reply?.id ??
          message.interactive?.list_reply?.id;
        const text =
          message.text?.body ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          "";
        if (!message.from || (!text && !replyId)) continue;

        handleIncomingMessage({
          from: message.from,
          name,
          text,
          replyId,
        }).catch((error) => {
          console.error("Falha ao processar mensagem WhatsApp", error);
        });
      }
    }
  }
});
