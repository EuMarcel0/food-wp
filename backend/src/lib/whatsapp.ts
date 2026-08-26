import { env, flags } from "../config/env.js";

const GRAPH = `https://graph.facebook.com/${env.whatsappGraphVersion}`;

type Button = { id: string; title: string };

type ListSection = {
  title: string;
  rows: { id: string; title: string; description?: string }[];
};

async function send(payload: Record<string, unknown>) {
  if (!flags.whatsappReady) {
    console.info("[whatsapp:dry-run]", JSON.stringify(payload, null, 2));
    return { dryRun: true };
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
        recipient_type: "individual",
        ...payload,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp API ${response.status}: ${body}`);
  }

  return response.json();
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
