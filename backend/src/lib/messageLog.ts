import {
  appendConversationMessage,
  findConversationByCustomerPhone,
  getConversation,
  saveConversation,
  upsertCustomer,
} from "../data/repository.js";
import type {
  ConversationMessageActions,
  ConversationMessageAuthor,
} from "../types.js";

type InteractivePayload = {
  type?: string;
  body?: { text?: string };
  action?: {
    buttons?: Array<{ reply?: { id?: string; title?: string } }>;
    button?: string;
    sections?: Array<{
      title?: string;
      rows?: Array<{ id?: string; title?: string; description?: string }>;
    }>;
  };
};

function extractInteractiveActions(
  interactive: InteractivePayload | undefined,
): ConversationMessageActions | null {
  if (!interactive?.type) return null;

  if (interactive.type === "button") {
    const items = (interactive.action?.buttons ?? [])
      .map((button) => ({
        id: button.reply?.id,
        title: String(button.reply?.title ?? "").trim(),
      }))
      .filter((item) => item.title);
    return items.length ? { type: "buttons", items } : null;
  }

  if (interactive.type === "list") {
    const items = (interactive.action?.sections ?? [])
      .flatMap((section) => section.rows ?? [])
      .map((row) => ({
        id: row.id,
        title: String(row.title ?? "").trim(),
        description: row.description?.trim() || undefined,
      }))
      .filter((item) => item.title);
    if (!items.length) return null;
    return {
      type: "list",
      listButtonLabel: interactive.action?.button?.trim() || "Opções",
      items,
    };
  }

  return null;
}

function extractOutboundBody(payload: Record<string, unknown>) {
  const type = String(payload.type ?? "text");
  if (type === "text") {
    const text = payload.text as { body?: string } | undefined;
    return {
      body: text?.body ?? "",
      msgType: "text",
      actions: null as ConversationMessageActions | null,
    };
  }
  if (type === "interactive") {
    const interactive = payload.interactive as InteractivePayload | undefined;
    const body = interactive?.body?.text ?? "";
    const actions = extractInteractiveActions(interactive);
    const msgType = interactive?.type === "list" ? "list" : "buttons";
    return { body, msgType, actions };
  }
  return { body: "", msgType: type, actions: null as ConversationMessageActions | null };
}

/** Persiste mensagem outbound após envio (ou dry-run). */
export async function logOutboundByPhone(
  to: string,
  payload: Record<string, unknown>,
  author: ConversationMessageAuthor = "bot",
) {
  try {
    const found = await findConversationByCustomerPhone(to);
    if (!found) return;
    const { body, msgType, actions } = extractOutboundBody(payload);
    if (!body.trim()) return;
    await appendConversationMessage({
      conversationId: found.conversation.id,
      customerId: found.customerId,
      storeId: found.storeId,
      direction: "outbound",
      author,
      body,
      msgType,
      actions,
    });
  } catch (error) {
    console.warn(
      "[message-log] falha ao salvar outbound:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Garante cliente/conversa e persiste inbound (chamar antes do engine). */
export async function logInboundByPhone(
  from: string,
  body: string,
  msgType = "text",
  profile?: { name?: string; avatarUrl?: string },
) {
  try {
    const text = body.trim();
    if (!text) return;
    const customer = await upsertCustomer(from, profile?.name, profile?.avatarUrl);
    let conversation = await getConversation(customer.id);
    if (!conversation) {
      conversation = await saveConversation(
        customer,
        "welcome",
        { cart: [] },
        { reopen: true },
      );
    }
    await appendConversationMessage({
      conversationId: conversation.id,
      customerId: customer.id,
      storeId: customer.storeId,
      direction: "inbound",
      author: "customer",
      body: text,
      msgType,
    });
  } catch (error) {
    console.warn(
      "[message-log] falha ao salvar inbound:",
      error instanceof Error ? error.message : error,
    );
  }
}
