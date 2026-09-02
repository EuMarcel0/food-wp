import type { LiveConversation } from "../types";

const READ_AT_KEY = "food-wp-conversas-read-at";
export const CONVERSATION_READ_EVENT = "food-wp-conversas-read";

export function readConversationReadAt(): Record<string, string> {
  try {
    const raw = localStorage.getItem(READ_AT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function markConversationRead(conversationId: string, lastMessageAt: string) {
  if (!conversationId || !lastMessageAt) return;
  try {
    const state = readConversationReadAt();
    const prev = state[conversationId] ?? "";
    if (lastMessageAt <= prev) return;
    state[conversationId] = lastMessageAt;
    localStorage.setItem(READ_AT_KEY, JSON.stringify(state));
  } catch {
    // storage bloqueado
  }
  window.dispatchEvent(new Event(CONVERSATION_READ_EVENT));
}

function unreadProbeAt(conversation: LiveConversation) {
  if (conversation.lastInboundAt) return conversation.lastInboundAt;
  if (conversation.lastMessageDirection === "inbound") {
    return conversation.lastMessageAt;
  }
  return null;
}

/** Primeira carga: não alerta nem marca tudo como não lido. */
export function primeConversationReadState(conversations: LiveConversation[]) {
  if (!conversations.length) return;
  try {
    const state = readConversationReadAt();
    let changed = false;
    for (const conv of conversations) {
      const probe = unreadProbeAt(conv) ?? conv.lastMessageAt;
      if (!probe || state[conv.id]) continue;
      state[conv.id] = probe;
      changed = true;
    }
    if (changed) {
      localStorage.setItem(READ_AT_KEY, JSON.stringify(state));
    }
  } catch {
    // storage bloqueado
  }
}

export function isConversationUnread(conversation: LiveConversation) {
  const probeAt = unreadProbeAt(conversation);
  if (!probeAt) return false;
  const readAt = readConversationReadAt()[conversation.id] ?? "";
  return probeAt > readAt;
}

export function conversationReadCursor(conversation: LiveConversation) {
  return unreadProbeAt(conversation) ?? conversation.lastMessageAt;
}

export function countUnreadConversations(conversations: LiveConversation[]) {
  return conversations.filter(isConversationUnread).length;
}

export function hasUnreadConversations(conversations: LiveConversation[]) {
  return countUnreadConversations(conversations) > 0;
}
