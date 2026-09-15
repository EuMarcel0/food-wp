import {
  findConversationByCustomerPhone,
  saveChatMedia,
  upsertCustomer,
} from "../data/repository.js";
import { logInboundByPhone } from "./messageLog.js";
import { downloadWhatsAppMedia } from "./whatsapp.js";

export type WhatsAppInboundMessage = {
  type?: string;
  id?: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: {
    id?: string;
    mime_type?: string;
    filename?: string;
    caption?: string;
  };
  video?: { id?: string; mime_type?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string; animated?: boolean };
  contacts?: Array<{
    name?: { formatted_name?: string; first_name?: string };
    phones?: Array<{ phone?: string; type?: string }>;
  }>;
};

const TYPE_LABEL: Record<string, string> = {
  image: "Imagem",
  document: "Documento",
  video: "Vídeo",
  sticker: "Figurinha",
  audio: "Áudio",
  contacts: "Contato",
  unsupported: "Arquivo",
};

export type ParsedInboundMedia = {
  mediaId: string;
  msgType: string;
  body: string;
  fileName?: string;
  mimeHint?: string;
};

function docBody(fileName?: string, caption?: string) {
  const name = fileName?.trim();
  if (caption?.trim()) return caption.trim();
  if (name) return `📎 Documento: ${name}`;
  return "📎 Documento";
}

export function parseInboundMedia(
  message: WhatsAppInboundMessage,
): ParsedInboundMedia | null {
  if (message.audio?.id) {
    return {
      mediaId: message.audio.id,
      msgType: "audio",
      body: "🎤 Áudio",
      mimeHint: message.audio.mime_type,
    };
  }
  if (message.image?.id) {
    const caption = message.image.caption?.trim();
    return {
      mediaId: message.image.id,
      msgType: "image",
      body: caption || "📷 Imagem",
      mimeHint: message.image.mime_type,
      fileName: "imagem.jpg",
    };
  }
  if (message.document?.id) {
    const fileName = message.document.filename?.trim();
    return {
      mediaId: message.document.id,
      msgType: "document",
      body: docBody(fileName, message.document.caption),
      mimeHint: message.document.mime_type,
      fileName: fileName || "documento",
    };
  }
  if (message.video?.id) {
    const caption = message.video.caption?.trim();
    return {
      mediaId: message.video.id,
      msgType: "video",
      body: caption || "🎬 Vídeo",
      mimeHint: message.video.mime_type,
      fileName: "video.mp4",
    };
  }
  if (message.sticker?.id) {
    return {
      mediaId: message.sticker.id,
      msgType: "sticker",
      body: "🧩 Figurinha",
      mimeHint: message.sticker.mime_type,
      fileName: "sticker.webp",
    };
  }
  return null;
}

/** Texto para o painel quando não há mídia para baixar (ex.: contato). */
export function describeInboundWithoutMedia(
  message: WhatsAppInboundMessage,
): { body: string; msgType: string } | null {
  if (message.type === "contacts" && message.contacts?.length) {
    const contact = message.contacts[0];
    const name =
      contact.name?.formatted_name?.trim() ||
      contact.name?.first_name?.trim() ||
      "Contato";
    const phone = contact.phones?.[0]?.phone?.trim();
    const body = phone
      ? `👤 Contato: ${name} (${phone})`
      : `👤 Contato: ${name}`;
    return { body, msgType: "contacts" };
  }

  const rawType = message.type?.trim() || "arquivo";
  const label = TYPE_LABEL[rawType] ?? rawType;
  return {
    body: `📎 ${label} (não processado pelo bot — veja no WhatsApp ou ligue para o cliente)`,
    msgType: rawType,
  };
}

export async function persistInboundWhatsAppMedia(input: {
  to: string;
  parsed: ParsedInboundMedia;
  waMessageId?: string;
  name?: string;
  avatarUrl?: string;
}) {
  const { parsed } = input;
  try {
    const downloaded = await downloadWhatsAppMedia(parsed.mediaId, {
      fileName: parsed.fileName,
      mimeHint: parsed.mimeHint,
    });
    const customer = await upsertCustomer(
      input.to,
      input.name,
      input.avatarUrl,
    );
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
      parsed.body,
      parsed.msgType,
      { name: input.name, avatarUrl: input.avatarUrl },
      {
        url: mediaUrl,
        mime: downloaded.mime,
        waMessageId: input.waMessageId ?? null,
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "falha ao baixar";
    const failBody = parsed.fileName
      ? `${parsed.body}\n(não baixou: ${detail})`
      : `${parsed.body}\n(não baixou: ${detail})`;
    await logInboundByPhone(
      input.to,
      failBody,
      parsed.msgType,
      { name: input.name, avatarUrl: input.avatarUrl },
      { waMessageId: input.waMessageId ?? null },
    );
  }
}
