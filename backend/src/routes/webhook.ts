import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import {
  handleIncomingMessage,
  handleUnsupportedInbound,
} from "../conversation/engine.js";
import { logInboundByPhone, logPhoneEchoByCustomerPhone } from "../lib/messageLog.js";
import {
  describeInboundWithoutMedia,
  parseInboundMedia,
  persistInboundWhatsAppMedia,
  type WhatsAppInboundMessage,
} from "../lib/inboundWhatsAppMedia.js";
import { enqueueByUser, queueKeyForPhone } from "../lib/userQueue.js";
import { noteWebhook } from "../lib/webhookStats.js";

const SILENT_TYPES = new Set(["reaction", "system"]);

export const webhookRouter = Router();

type WhatsAppChange = {
  field?: string;
  value?: {
    messages?: Array<
      WhatsAppInboundMessage & {
        from: string;
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
      }
    >;
    /** Coexistência: mensagens enviadas pelo WhatsApp Business no celular. */
    message_echoes?: Array<{
      from?: string;
      to?: string;
      id?: string;
      timestamp?: string;
      type?: string;
      text?: { body?: string };
      image?: { caption?: string; id?: string };
      video?: { caption?: string; id?: string };
      document?: { caption?: string; filename?: string; id?: string };
      audio?: { id?: string };
      sticker?: { id?: string };
      revoke?: { original_message_id?: string };
      edit?: {
        original_message_id?: string;
        message?: Record<string, unknown>;
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
  let echoes = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const field = change.field ?? "";

      // Coexistência: espelha o que a pessoa enviou pelo app do celular.
      if (field === "smb_message_echoes") {
        const messageEchoes = change.value?.message_echoes ?? [];
        noteWebhook(field, messageEchoes.length);
        for (const echo of messageEchoes) {
          const customerPhone = String(echo.to ?? "").replace(/\D/g, "");
          if (!customerPhone) continue;
          if (echo.type === "revoke" || echo.type === "edit") {
            console.log(
              `WhatsApp smb_message_echoes ignore type=${echo.type} to=${customerPhone}`,
            );
            continue;
          }

          const type = echo.type ?? "text";
          let body = "";
          if (type === "text") body = echo.text?.body ?? "";
          else if (type === "image") body = echo.image?.caption?.trim() || "📷 Imagem";
          else if (type === "video") body = echo.video?.caption?.trim() || "🎬 Vídeo";
          else if (type === "document") {
            body =
              echo.document?.caption?.trim() ||
              echo.document?.filename?.trim() ||
              "📎 Documento";
          } else if (type === "audio") body = "🎤 Áudio";
          else if (type === "sticker") body = "🧩 Figurinha";
          else body = `[${type}]`;

          echoes += 1;
          const queueKey = queueKeyForPhone(customerPhone);
          console.log(
            `WhatsApp smb_message_echoes type=${type} to=${customerPhone}`,
          );
          enqueueByUser(queueKey, async () => {
            await logPhoneEchoByCustomerPhone({
              customerPhone,
              body,
              msgType: type,
              waMessageId: echo.id ?? null,
            });
          }).catch((error) => {
            console.error("Falha ao espelhar mensagem do celular", error);
          });
        }
        continue;
      }

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

        const inboundMedia = parseInboundMedia(message);
        if (inboundMedia) {
          incoming += 1;
          console.log(
            `WhatsApp inbound media type=${inboundMedia.msgType} from=${message.from} wa_id=${waId ?? "-"}`,
          );
          enqueueByUser(queueKey, async () => {
            await persistInboundWhatsAppMedia({
              to,
              parsed: inboundMedia,
              waMessageId: message.id,
              name,
              avatarUrl,
            });
            await handleUnsupportedInbound({
              from: to,
              name,
              avatarUrl,
              waMessageId: message.id,
            });
          }).catch((error) => {
            console.error("Falha ao processar mídia WhatsApp", error);
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
            const described = describeInboundWithoutMedia(message);
            await logInboundByPhone(
              to,
              described?.body ??
                `📎 Arquivo (não processado pelo bot — veja no WhatsApp ou ligue para o cliente)`,
              described?.msgType ?? message.type ?? "unsupported",
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
    `WhatsApp webhook: ${incoming} mensagem(ns) processada(s)${
      echoes ? `, ${echoes} echo(s) do celular` : ""
    }`,
  );
});
