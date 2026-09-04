import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import {
  handleIncomingMessage,
  handleUnsupportedInbound,
} from "../conversation/engine.js";
import {
  findConversationByCustomerPhone,
  saveChatMedia,
  upsertCustomer,
} from "../data/repository.js";
import { logInboundByPhone } from "../lib/messageLog.js";
import { enqueueByUser, queueKeyForPhone } from "../lib/userQueue.js";
import { noteWebhook } from "../lib/webhookStats.js";
import { downloadWhatsAppMedia } from "../lib/whatsapp.js";

const SILENT_TYPES = new Set(["reaction", "system"]);

export const webhookRouter = Router();

type WhatsAppChange = {
  field?: string;
  value?: {
    messages?: Array<{
      from: string;
      id?: string;
      type?: string;
      text?: { body?: string };
      audio?: { id?: string; mime_type?: string; voice?: boolean };
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
    contacts?: Array<{
      profile?: { name?: string; picture?: string };
      wa_id?: string;
    }>;
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

async function persistInboundAudio(input: {
  to: string;
  mediaId: string;
  waMessageId?: string;
  name?: string;
  avatarUrl?: string;
}) {
  const downloaded = await downloadWhatsAppMedia(input.mediaId);
  const customer = await upsertCustomer(input.to, input.name, input.avatarUrl);
  const found = await findConversationByCustomerPhone(input.to);
  const conversationId = found?.conversation.id ?? `pending-${customer.id}`;
  const mediaUrl = await saveChatMedia({
    storeId: customer.storeId,
    conversationId,
    bytes: downloaded.bytes,
    mime: downloaded.mime,
    fileName: downloaded.fileName,
  });
  await logInboundByPhone(
    input.to,
    "🎤 Áudio",
    "audio",
    { name: input.name, avatarUrl: input.avatarUrl },
    {
      url: mediaUrl,
      mime: downloaded.mime,
      waMessageId: input.waMessageId ?? null,
    },
  );
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
      const profile = change.value?.contacts?.[0]?.profile;
      const name = profile?.name;
      const avatarUrl = profile?.picture?.trim() || undefined;
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

        if (message.type === "audio" && message.audio?.id) {
          incoming += 1;
          console.log(`WhatsApp inbound audio from=${message.from} wa_id=${waId ?? "-"}`);
          enqueueByUser(queueKey, async () => {
            try {
              await persistInboundAudio({
                to,
                mediaId: message.audio!.id!,
                waMessageId: message.id,
                name,
                avatarUrl,
              });
            } catch (error) {
              console.error("Falha ao salvar áudio WhatsApp", error);
              await logInboundByPhone(
                to,
                "🎤 Áudio (falha ao baixar)",
                "audio",
                { name, avatarUrl },
              );
            }
            await handleUnsupportedInbound({
              from: to,
              name,
              avatarUrl,
              waMessageId: message.id,
            });
          }).catch((error) => {
            console.error("Falha ao processar áudio WhatsApp", error);
          });
          continue;
        }

        if (!text && !replyId && !location) {
          if (SILENT_TYPES.has(message.type ?? "")) continue;
          incoming += 1;
          console.log(
            `WhatsApp inbound unsupported type=${message.type ?? "?"} from=${message.from}`,
          );
          enqueueByUser(queueKey, async () => {
            await logInboundByPhone(
              to,
              `[${message.type ?? "mídia"} não suportado]`,
              message.type ?? "unsupported",
              { name, avatarUrl },
            );
            await handleUnsupportedInbound({
              from: to,
              name,
              avatarUrl,
              waMessageId: message.id,
            });
          }).catch((error) => {
            console.error("Falha ao avisar mensagem não suportada", error);
          });
          continue;
        }
        incoming += 1;
        console.log(
          `WhatsApp inbound from=${message.from} wa_id=${waId ?? "-"} reply=${to}`,
        );

        const inboundBody =
          text ||
          (location
            ? [
                `📍 Localização${
                  location.address?.trim()
                    ? `: ${location.address.trim()}`
                    : location.name?.trim()
                      ? `: ${location.name.trim()}`
                      : ""
                }`,
                `https://maps.google.com/?q=${location.latitude},${location.longitude}`,
              ].join("\n")
            : replyId
              ? `[opção] ${replyId}`
              : "");

        enqueueByUser(queueKey, async () => {
          await logInboundByPhone(
            to,
            inboundBody,
            location ? "location" : replyId ? "interactive" : "text",
            { name, avatarUrl },
          );
          await handleIncomingMessage({
            from: to,
            name,
            avatarUrl,
            text,
            replyId,
            location,
            waMessageId: message.id,
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
