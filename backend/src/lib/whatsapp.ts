import { env, flags } from "../config/env.js";

const GRAPH = `https://graph.facebook.com/${env.whatsappGraphVersion}`;

type Button = { id: string; title: string };

type ListSection = {
  title: string;
  rows: { id: string; title: string; description?: string }[];
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** Brasil: o 9 extra depois do DDD às vezes entra no webhook e não na lista de teste. */
function brazilRecipientOptions(to: string) {
  const digits = digitsOnly(to);
  const options = [digits];
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    options.push(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }
  if (digits.startsWith("55") && digits.length === 12) {
    options.push(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  return [...new Set(options)];
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

async function send(payload: Record<string, unknown>) {
  if (!flags.whatsappReady) {
    console.info("[whatsapp:dry-run]", JSON.stringify(payload, null, 2));
    return { dryRun: true };
  }

  const targets = brazilRecipientOptions(String(payload.to ?? ""));
  let lastBody = "";
  let lastStatus = 0;
  for (const to of targets) {
    const result = await sendTo(to, payload);
    if (result.ok) {
      if (to !== targets[0]) {
        console.log(`WhatsApp: enviado para formato alternativo ${to}`);
      }
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

export async function sendText(to: string, body: string) {
  return send({ to, type: "text", text: { preview_url: false, body } });
}

export async function sendButtons(to: string, body: string, buttons: Button[]) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
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
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.map((section) => ({
          title: section.title.slice(0, 24),
          rows: section.rows.slice(0, 10).map((row) => ({
            id: row.id,
            title: row.title.slice(0, 24),
            description: row.description?.slice(0, 72),
          })),
        })),
      },
    },
  });
}
