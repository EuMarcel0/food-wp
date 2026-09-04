import { env, flags } from "../config/env.js";
import { logOutboundByPhone } from "./messageLog.js";
import type { ConversationMessageAuthor } from "../types.js";

const GRAPH = `https://graph.facebook.com/${env.whatsappGraphVersion}`;

/** Formato que a Cloud API aceitou por número (processo). Evita retry 131030. */
const preferredRecipientByKey = new Map<string, string>();

type Button = { id: string; title: string };

type ListSection = {
  title: string;
  rows: { id: string; title: string; description?: string }[];
};

/** Evita linhas em branco extras no balão do WhatsApp. */
function normalizeBody(body: string) {
  return body.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/**
 * Chave estável BR: DDD + 8 dígitos locais (ignora o 9 móvel).
 * Ex.: 5577991776299 e 557791776299 → 7791776299
 */
function brazilPhoneKey(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") {
    digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  }
  return digits;
}

/**
 * Brasil: webhook/wa_id muitas vezes vem sem o 9 (12 dígitos), mas a Cloud API
 * só entrega com o 9 (13). Erro 131030 = destinatário inválido naquele formato.
 * Preferimos o formato com 9 e o último que já funcionou para esse número.
 */
function brazilRecipientOptions(to: string) {
  const digits = digitsOnly(to);
  const options: string[] = [];
  const preferred = preferredRecipientByKey.get(brazilPhoneKey(digits));
  if (preferred) options.push(preferred);

  if (digits.startsWith("55") && digits.length === 12) {
    // Celular sem 9 → tenta COM 9 primeiro (caso do print).
    options.push(`${digits.slice(0, 4)}9${digits.slice(4)}`, digits);
  } else if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    options.push(digits, `${digits.slice(0, 4)}${digits.slice(5)}`);
  } else {
    options.push(digits);
  }

  return [...new Set(options)];
}

function rememberPreferredRecipient(originalTo: string, workingTo: string) {
  preferredRecipientByKey.set(brazilPhoneKey(originalTo), digitsOnly(workingTo));
}

async function sendTo(to: string, payload: Record<string, unknown>) {
  const response = await fetch(
    `${GRAPH}/${env.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...payload,
        to,
      }),
    },
  );
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

async function send(
  payload: Record<string, unknown>,
  opts?: { author?: ConversationMessageAuthor; skipLog?: boolean },
) {
  const author = opts?.author ?? "bot";
  const log = async () => {
    if (opts?.skipLog) return;
    await logOutboundByPhone(String(payload.to ?? ""), payload, author);
  };

  if (!flags.whatsappReady) {
    console.info("[whatsapp:dry-run]", JSON.stringify(payload, null, 2));
    await log();
    return { dryRun: true };
  }

  const originalTo = String(payload.to ?? "");
  const targets = brazilRecipientOptions(originalTo);
  let lastBody = "";
  let lastStatus = 0;
  for (const to of targets) {
    const result = await sendTo(to, payload);
    if (result.ok) {
      rememberPreferredRecipient(originalTo, to);
      if (to !== targets[0]) {
        console.log(`WhatsApp: enviado para formato alternativo ${to}`);
      }
      await log();
      return JSON.parse(result.body || "{}");
    }
    lastStatus = result.status;
    lastBody = result.body;
    if (!result.body.includes("131030")) break;
    console.warn(`WhatsApp 131030 para ${to}; tentando outro formato`);
  }

  if (lastStatus === 401 || lastBody.includes('"code":190')) {
    throw new Error(
      "WhatsApp API 401: token expirado ou inválido. Gere um novo Access Token no Meta e atualize WHATSAPP_TOKEN no Railway (e no backend/.env local).",
    );
  }

  throw new Error(`WhatsApp API ${lastStatus}: ${lastBody}`);
}

export async function checkWhatsAppToken() {
  if (!flags.whatsappReady) return false;
  try {
    const response = await fetch(
      `${GRAPH}/${env.whatsappPhoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${env.whatsappToken}` } },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function subscribeWhatsAppApp() {
  if (!flags.whatsappReady || !env.whatsappWabaId) return;
  const response = await fetch(`${GRAPH}/${env.whatsappWabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsappToken}` },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error("WhatsApp: falha ao inscrever o app na WABA", response.status, body);
    return;
  }
  console.log("WhatsApp: app inscrito na WABA");
}

export async function sendText(
  to: string,
  body: string,
  opts?: { author?: ConversationMessageAuthor; skipLog?: boolean },
) {
  return send(
    {
      to,
      type: "text",
      text: { preview_url: false, body: normalizeBody(body) },
    },
    opts,
  );
}

/**
 * Marca a mensagem como lida e mostra "Digitando…" no WhatsApp do cliente
 * (até ~25s ou até a próxima resposta). Exige o wamid da mensagem recebida.
 */
export async function sendTypingIndicator(waMessageId: string) {
  const messageId = waMessageId.trim();
  if (!messageId) return { skipped: true as const };

  if (!flags.whatsappReady) {
    console.info("[whatsapp:dry-run] typing_indicator", messageId);
    return { dryRun: true as const };
  }

  const response = await fetch(
    `${GRAPH}/${env.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    console.warn(`WhatsApp typing_indicator ${response.status}: ${body}`);
    return { ok: false as const, status: response.status, body };
  }
  return { ok: true as const };
}

export async function sendButtons(to: string, body: string, buttons: Button[]) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: normalizeBody(body) },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: { id: button.id, title: button.title.slice(0, 20) },
        })),
      },
    },
  });
}

export async function sendList(
  to: string,
  body: string,
  buttonLabel: string,
  sections: ListSection[],
) {
  const cleanedSections = sections
    .map((section) => ({
      title: section.title.trim().slice(0, 24),
      rows: section.rows.slice(0, 10).map((row) => ({
        id: row.id,
        title: row.title.slice(0, 24),
        ...(row.description ? { description: row.description.slice(0, 72) } : {}),
      })),
    }))
    .filter((section) => section.rows.length > 0);

  return send({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: normalizeBody(body) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: cleanedSections.map((section) => ({
          // Título da seção só é obrigatório com mais de uma seção.
          ...(cleanedSections.length > 1 && section.title
            ? { title: section.title }
            : {}),
          rows: section.rows,
        })),
      },
    },
  });
}

function graphError(status: number, body: string, fallback: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // corpo não é JSON
  }
  return body || fallback || `WhatsApp API ${status}`;
}

async function resolveWhatsAppAppId() {
  if (env.whatsappAppId) return env.whatsappAppId;
  const response = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(env.whatsappToken)}&access_token=${encodeURIComponent(env.whatsappToken)}`,
  );
  const json = (await response.json()) as { data?: { app_id?: string } };
  return String(json.data?.app_id ?? "");
}

async function uploadProfilePictureHandle(bytes: Buffer, mime: string, fileName: string) {
  const appId = await resolveWhatsAppAppId();
  if (!appId) {
    throw new Error(
      "Informe WHATSAPP_APP_ID no .env para enviar a foto ao perfil do WhatsApp.",
    );
  }

  const sessionResponse = await fetch(
    `${GRAPH}/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}`,
    {
      method: "POST",
      headers: { Authorization: `OAuth ${env.whatsappToken}` },
    },
  );
  const sessionBody = await sessionResponse.text();
  if (!sessionResponse.ok) {
    throw new Error(graphError(sessionResponse.status, sessionBody, "Falha ao abrir o envio da foto."));
  }
  const session = JSON.parse(sessionBody) as { id?: string };
  if (!session.id) throw new Error("WhatsApp não devolveu a sessão de upload.");

  const uploadResponse = await fetch(`${GRAPH}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${env.whatsappToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });
  const uploadBody = await uploadResponse.text();
  if (!uploadResponse.ok) {
    throw new Error(graphError(uploadResponse.status, uploadBody, "Falha ao enviar a foto."));
  }
  const uploaded = JSON.parse(uploadBody) as { h?: string };
  if (!uploaded.h) throw new Error("WhatsApp não devolveu o identificador da foto.");
  return uploaded.h;
}

export async function updateWhatsAppBusinessProfile(input: {
  about?: string;
  picture?: { bytes: Buffer; mime: string; fileName: string };
}) {
  if (!flags.whatsappReady) return { skipped: true as const };

  const payload: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (input.about?.trim()) payload.about = input.about.trim().slice(0, 139);
  if (input.picture) {
    payload.profile_picture_handle = await uploadProfilePictureHandle(
      input.picture.bytes,
      input.picture.mime,
      input.picture.fileName,
    );
  }
  if (Object.keys(payload).length <= 1) return { skipped: true as const };

  const response = await fetch(
    `${GRAPH}/${env.whatsappPhoneNumberId}/whatsapp_business_profile`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(graphError(response.status, body, "Falha ao atualizar o perfil do WhatsApp."));
  }
  return { skipped: false as const };
}

export type WhatsAppMediaDownload = {
  bytes: Buffer;
  mime: string;
  fileName: string;
};

/** Baixa mídia (áudio/imagem/…) pelo media id do webhook. */
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<WhatsAppMediaDownload> {
  if (!flags.whatsappReady) {
    throw new Error("WhatsApp não configurado.");
  }
  const id = mediaId.trim();
  if (!id) throw new Error("Media id vazio.");

  const metaResponse = await fetch(`${GRAPH}/${id}`, {
    headers: { Authorization: `Bearer ${env.whatsappToken}` },
  });
  const metaBody = await metaResponse.text();
  if (!metaResponse.ok) {
    throw new Error(
      graphError(metaResponse.status, metaBody, "Falha ao obter URL da mídia."),
    );
  }
  const meta = JSON.parse(metaBody) as {
    url?: string;
    mime_type?: string;
  };
  if (!meta.url) throw new Error("WhatsApp não devolveu a URL da mídia.");

  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.whatsappToken}` },
  });
  if (!fileResponse.ok) {
    throw new Error(`Falha ao baixar mídia (${fileResponse.status}).`);
  }
  const mime =
    meta.mime_type?.trim() ||
    fileResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
    "audio/ogg";
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  const ext =
    mime.includes("mpeg") || mime.includes("mp3")
      ? "mp3"
      : mime.includes("mp4") || mime.includes("m4a")
        ? "m4a"
        : mime.includes("amr")
          ? "amr"
          : "ogg";
  return {
    bytes,
    mime,
    fileName: `${id}.${ext}`,
  };
}
