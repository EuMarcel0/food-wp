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

/** Primeira carga: não alerta nem marca tudo como não lido. */
export function primeConversationReadState(conversations: LiveConversation[]) {
  if (!conversations.length) return;
  try {
    const state = readConversationReadAt();
    let changed = false;
    for (const conv of conversations) {
      if (!conv.lastMessageAt || state[conv.id]) continue;
      state[conv.id] = conv.lastMessageAt;
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
  if (!conversation.lastMessageAt) return false;
  if (conversation.lastMessageDirection !== "inbound") return false;
  const readAt = readConversationReadAt()[conversation.id] ?? "";
  return conversation.lastMessageAt > readAt;
}

export function countUnreadConversations(conversations: LiveConversation[]) {
  return conversations.filter(isConversationUnread).length;
}

export function hasUnreadConversations(conversations: LiveConversation[]) {
  return countUnreadConversations(conversations) > 0;
}
