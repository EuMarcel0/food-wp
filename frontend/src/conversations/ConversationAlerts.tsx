import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CONVERSATION_READ_EVENT,
  markConversationRead,
  primeConversationReadState,
} from "../lib/conversationBadge";
import { playNewMessageSound } from "../lib/notifySound";
import type { LiveConversation } from "../types";

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
) {
  const prevAt = useRef<Map<string, string>>(new Map());
  const primed = useRef(false);
  const [, setReadTick] = useState(0);

  useEffect(() => {
    const onRead = () => setReadTick((value) => value + 1);
    window.addEventListener(CONVERSATION_READ_EVENT, onRead);
    return () => window.removeEventListener(CONVERSATION_READ_EVENT, onRead);
  }, []);

  useEffect(() => {
    if (!conversations.length) return;

    if (!primed.current) {
      primeConversationReadState(conversations);
      for (const conv of conversations) {
        prevAt.current.set(conv.id, conv.lastMessageAt);
      }
      primed.current = true;
      return;
    }

    for (const conv of conversations) {
      const prev = prevAt.current.get(conv.id) ?? "";
      if (conv.lastMessageAt <= prev) continue;

      prevAt.current.set(conv.id, conv.lastMessageAt);

      if (conv.id === viewingConversationId) {
        markConversationRead(conv.id, conv.lastMessageAt);
        continue;
      }

      if (conv.lastMessageDirection !== "inbound") continue;

      playNewMessageSound();
    }
  }, [conversations, viewingConversationId]);
}

export function ConversationAlertsProvider({
  conversations,
  children,
}: {
  conversations: LiveConversation[];
  children: ReactNode;
}) {
  const [viewingConversationId, setViewingConversationId] = useState<string | null>(
    null,
  );

  useConversationAlerts(conversations, viewingConversationId);

  return (
    <ConversationViewingContext.Provider value={{ setViewingConversationId }}>
      {children}
    </ConversationViewingContext.Provider>
  );
}
