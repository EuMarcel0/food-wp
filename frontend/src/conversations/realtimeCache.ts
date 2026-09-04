import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import type {
  ConversationMessage,
  ConversationMessageActions,
  ConversationMessagesPage,
  LiveConversation,
} from "../types";

type MessagesCursor = { createdAt: string; id: string } | null;
export type MessagesInfinite = InfiniteData<ConversationMessagesPage, MessagesCursor>;

function mapRealtimeActions(raw: unknown): ConversationMessageActions | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const type = data.type === "list" ? "list" : data.type === "buttons" ? "buttons" : null;
  if (!type) return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const title = String(row.title ?? "").trim();
          if (!title) return null;
          return {
            id: row.id != null ? String(row.id) : undefined,
            title,
            description:
              row.description != null
                ? String(row.description).trim() || undefined
                : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
    : [];
  if (!items.length) return null;
  return {
    type,
    items,
    listButtonLabel:
      data.listButtonLabel != null
        ? String(data.listButtonLabel).trim() || undefined
        : undefined,
  };
}

export function mapRealtimeConversationMessage(
  row: Record<string, unknown>,
): ConversationMessage | null {
  if (row.id == null || row.conversation_id == null) return null;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    customerId: String(row.customer_id ?? ""),
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    author:
      row.author === "customer"
        ? "customer"
        : row.author === "agent"
          ? "agent"
          : "bot",
    body: String(row.body ?? ""),
    msgType: String(row.msg_type ?? "text"),
    actions: mapRealtimeActions(row.actions),
    mediaUrl: row.media_url != null ? String(row.media_url) : null,
    mediaMime: row.media_mime != null ? String(row.media_mime) : null,
    waMessageId: row.wa_message_id != null ? String(row.wa_message_id) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function upsertMessageInCache(
  current: MessagesInfinite | undefined,
  message: ConversationMessage,
): MessagesInfinite {
  if (!current?.pages.length) {
    return {
      pages: [
        {
          items: [message],
          hasMore: false,
          nextBefore: null,
        },
      ],
      pageParams: [null],
    };
  }

  let found = false;
  const pages = current.pages.map((page) => {
    const index = page.items.findIndex((item) => item.id === message.id);
    if (index < 0) return page;
    found = true;
    const items = page.items.slice();
    items[index] = message;
    return { ...page, items };
  });

  if (found) return { ...current, pages };

  const nextPages = pages.map((page, index) =>
    index === 0 ? { ...page, items: [...page.items, message] } : page,
  );
  return { ...current, pages: nextPages };
}

function previewFromBody(body: string, fallback?: string | null) {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return fallback ?? null;
  return text.slice(0, 160);
}

/** Atualiza lista + thread aberta na hora do INSERT (funciona com aba em segundo plano). */
export function applyRealtimeMessageToCaches(
  queryClient: QueryClient,
  row: Record<string, unknown>,
  viewingConversationId?: string | null,
) {
  const message = mapRealtimeConversationMessage(row);
  if (!message) return;

  const conversationId = message.conversationId;
  const createdAt = message.createdAt;
  const direction = message.direction;

  let missingFromList = false;
  queryClient.setQueryData<LiveConversation[]>(
    queryKeys.conversations.live,
    (current) => {
      if (!current?.length) {
        missingFromList = true;
        return current;
      }
      const index = current.findIndex((item) => item.id === conversationId);
      if (index < 0) {
        missingFromList = true;
        return current;
      }
      const prev = current[index];
      const updated: LiveConversation = {
        ...prev,
        lastMessageAt: createdAt,
        lastMessagePreview: previewFromBody(message.body, prev.lastMessagePreview),
        lastMessageDirection: direction,
        lastInboundAt:
          direction === "inbound" ? createdAt : (prev.lastInboundAt ?? null),
      };
      const next = current.slice();
      next.splice(index, 1);
      return [updated, ...next];
    },
  );

  if (missingFromList) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.live,
    });
  }

  if (viewingConversationId && viewingConversationId === conversationId) {
    queryClient.setQueryData<MessagesInfinite>(
      queryKeys.conversations.messages(conversationId),
      (current) => upsertMessageInCache(current, message),
    );
  }
}
