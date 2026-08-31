const SEEN_KEY = "food-wp-conversas-seen-ids";

export function readSeenConversationIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function markConversationsSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage bloqueado
  }
  window.dispatchEvent(new Event("food-wp-conversas-seen"));
}

export function hasUnseenConversations(activeIds: string[]) {
  if (!activeIds.length) return false;
  const seen = readSeenConversationIds();
  return activeIds.some((id) => !seen.has(id));
}
