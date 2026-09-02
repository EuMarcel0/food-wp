import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CONVERSATION_READ_EVENT,
  conversationReadCursor,
  markConversationRead,
  primeConversationReadState,
} from "../lib/conversationBadge";
import { playNewMessageSound } from "../lib/notifySound";
import { queryKeys } from "../lib/queryKeys";
import { supabase } from "../lib/supabase";
import type { LiveConversation } from "../types";

export const CONVERSATIONS_LIVE_EVENT = "food-wp-conversas-live";

type ConversationViewingContextValue = {
  setViewingConversationId: (id: string | null) => void;
};

const ConversationViewingContext =
  createContext<ConversationViewingContextValue | null>(null);

export function useConversationViewing() {
  const context = useContext(ConversationViewingContext);
  if (!context) {
    throw new Error(
      "useConversationViewing precisa estar dentro de ConversationAlertsProvider",
    );
  }
  return context;
}

export function useConversationAlerts(
  conversations: LiveConversation[],
  viewingConversationId: string | null,
  realtimeEnabled: boolean,
) {
  const prevInboundAt = useRef<Map<string, string>>(new Map());
  const primed = useRef(false);
  const conversationsKey = conversations
    .map(
      (conv) =>
        `${conv.id}:${conv.lastMessageAt}:${conv.lastInboundAt ?? ""}:${conv.lastMessageDirection ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    if (!conversations.length) return;

    if (!primed.current) {
      primeConversationReadState(conversations);
      for (const conv of conversations) {
        const probe = conversationReadCursor(conv);
        prevInboundAt.current.set(conv.id, probe);
      }
      primed.current = true;
      return;
    }

    // Com Supabase Realtime, o som é disparado no INSERT de mensagem.
    if (realtimeEnabled) {
      for (const conv of conversations) {
        const probe = conversationReadCursor(conv);
        prevInboundAt.current.set(conv.id, probe);
        if (conv.id === viewingConversationId) {
          markConversationRead(conv.id, probe);
        }
      }
      return;
    }

    for (const conv of conversations) {
      const probe = conversationReadCursor(conv);
      const prev = prevInboundAt.current.get(conv.id) ?? "";
      if (probe <= prev) continue;

      prevInboundAt.current.set(conv.id, probe);

      if (conv.id === viewingConversationId) {
        markConversationRead(conv.id, probe);
        continue;
      }

      if (!conv.lastInboundAt && conv.lastMessageDirection !== "inbound") continue;

      playNewMessageSound();
      window.dispatchEvent(new Event(CONVERSATION_READ_EVENT));
    }
  }, [conversationsKey, realtimeEnabled, viewingConversationId]);
}

export function ConversationAlertsProvider({
  conversations,
  children,
}: {
  conversations: LiveConversation[];
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [viewingConversationId, setViewingConversationId] = useState<string | null>(
    null,
  );
  const viewingIdRef = useRef<string | null>(null);

  useEffect(() => {
    viewingIdRef.current = viewingConversationId;
  }, [viewingConversationId]);

  useConversationAlerts(conversations, viewingConversationId, Boolean(supabase));

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const notifyLive = () => {
      window.dispatchEvent(new Event(CONVERSATIONS_LIVE_EVENT));
    };

    const channel = client
      .channel("conversation-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages" },
        (payload) => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.live,
          });
          notifyLive();

          const row = payload.new as Record<string, unknown> | undefined;
          if (row?.direction !== "inbound") return;

          playNewMessageSound();
          window.dispatchEvent(new Event(CONVERSATION_READ_EVENT));

          const conversationId = row.conversation_id
            ? String(row.conversation_id)
            : "";
          if (!conversationId || conversationId !== viewingIdRef.current) return;

          const createdAt = row.created_at ? String(row.created_at) : "";
          if (createdAt) {
            markConversationRead(conversationId, createdAt);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.live,
          });
          notifyLive();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <ConversationViewingContext.Provider value={{ setViewingConversationId }}>
      {children}
    </ConversationViewingContext.Provider>
  );
}
