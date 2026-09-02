import {
  appendConversationMessage,
  findConversationByCustomerPhone,
  getConversation,
  saveConversation,
  upsertCustomer,
} from "../data/repository.js";
import type { ConversationMessageAuthor } from "../types.js";

function extractOutboundBody(payload: Record<string, unknown>) {
  const type = String(payload.type ?? "text");
  if (type === "text") {
    const text = payload.text as { body?: string } | undefined;
    return { body: text?.body ?? "", msgType: "text" };
  }
  if (type === "interactive") {
    const interactive = payload.interactive as
      | { type?: string; body?: { text?: string } }
      | undefined;
    const body = interactive?.body?.text ?? "";
    return {
      body,
      msgType: interactive?.type === "list" ? "list" : "buttons",
    };
  }
  return { body: "", msgType: type };
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
    const { body, msgType } = extractOutboundBody(payload);
    if (!body.trim()) return;
    await appendConversationMessage({
      conversationId: found.conversation.id,
      customerId: found.customerId,
      storeId: found.storeId,
      direction: "outbound",
      author,
      body,
      msgType,
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
