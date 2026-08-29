import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { handleIncomingMessage } from "../conversation/engine.js";
import { enqueueByUser, queueKeyForPhone } from "../lib/userQueue.js";
import { sendText } from "../lib/whatsapp.js";
import { noteWebhook } from "../lib/webhookStats.js";

const SILENT_TYPES = new Set(["reaction", "system"]);
const UNSUPPORTED_MEDIA_REPLY =
  "Ainda não consigo entender esse tipo de mensagem (áudio, foto, vídeo ou documento).\n\nPara continuar, responda *por texto* ou toque nas opções da última mensagem.";

export const webhookRouter = Router();

type WhatsAppChange = {
  field?: string;
  value?: {
    messages?: Array<{
      from: string;
      type?: string;
      text?: { body?: string };
      location?: {
        latitude?: number;
        longitude?: number;
        name?: string;
        address?: string;
      };
      interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string };
      };
    }>;
    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
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
    console.warn("WhatsApp webhook: assinatura inválida");
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);

  const entries = (req.body?.entry ?? []) as Array<{ changes?: WhatsAppChange[] }>;
  let incoming = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      noteWebhook(change.field, messages.length);
      const name = change.value?.contacts?.[0]?.profile?.name;
      const waId = change.value?.contacts?.[0]?.wa_id;
      for (const message of messages) {
        const replyId =
          message.interactive?.button_reply?.id ??
          message.interactive?.list_reply?.id;
        const text =
          message.text?.body ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          "";
        const location =
          message.type === "location" &&
          message.location?.latitude != null &&
          message.location?.longitude != null
            ? {
                latitude: Number(message.location.latitude),
                longitude: Number(message.location.longitude),
                name: message.location.name,
                address: message.location.address,
              }
            : undefined;
        const to = waId || message.from;
        if (!to) continue;
        const queueKey = queueKeyForPhone(to);
        if (!text && !replyId && !location) {
          if (SILENT_TYPES.has(message.type ?? "")) continue;
          incoming += 1;
          console.log(
            `WhatsApp inbound unsupported type=${message.type ?? "?"} from=${message.from}`,
          );
          enqueueByUser(queueKey, async () => {
            await sendText(to, UNSUPPORTED_MEDIA_REPLY);
          }).catch((error) => {
            console.error("Falha ao avisar mensagem não suportada", error);
          });
          continue;
        }
        incoming += 1;
        console.log(
          `WhatsApp inbound from=${message.from} wa_id=${waId ?? "-"} reply=${to}`,
        );

        enqueueByUser(queueKey, async () => {
          await handleIncomingMessage({
            from: to,
            name,
            text,
            replyId,
            location,
          });
        }).catch((error) => {
          console.error("Falha ao processar mensagem WhatsApp", error);
        });
      }
    }
  }
  console.log(
    `WhatsApp webhook: ${incoming} mensagem(ns) processada(s)`,
  );
});
