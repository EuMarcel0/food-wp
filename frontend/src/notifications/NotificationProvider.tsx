import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import {
  drainAutoPrintQueue,
  isAutoAcceptNotification,
  printAfterAutoAccept,
} from "../lib/autoPrint";
import { isAutoPrintStation } from "../lib/printAgent";
import { bindNotifySoundUnlock, playNewOrderSound } from "../lib/notifySound";
import { supabase } from "../lib/supabase";
import type { AppNotification } from "../types";

const NOTIF_FIRST_PAGE = 20;
const NOTIF_PAGE_SIZE = 15;

type NotificationContextValue = {
  items: AppNotification[];
  unread: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function readerFromUser(email?: string | null) {
  return email?.trim() || "demo";
}

function sortByNewest(items: AppNotification[]) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return right.id.localeCompare(left.id);
  });
}

function mergeNotifications(
  current: AppNotification[],
  incoming: AppNotification[],
) {
  const map = new Map<string, AppNotification>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return sortByNewest([...map.values()]);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const reader = readerFromUser(user?.email);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);
  const loadingMoreRef = useRef(false);

  const applyNewItemsSideEffects = useCallback((incoming: AppNotification[]) => {
    if (!primed.current) {
      seen.current = new Set(incoming.map((item) => item.id));
      primed.current = true;
      if (isAutoPrintStation()) {
        void drainAutoPrintQueue();
      }
      return;
    }
    for (const item of incoming) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.type === "order_created") playNewOrderSound();
      if (isAutoAcceptNotification(item)) {
        void printAfterAutoAccept(item.orderId, item.orderCode);
      }
    }
  }, []);

  const refreshHead = useCallback(
    async (silent = true) => {
      const page = await api.notifications(reader, silent, {
        limit: NOTIF_FIRST_PAGE,
        offset: 0,
      });
      const wasPrimed = primed.current;
      applyNewItemsSideEffects(page.items);
      setItems((current) =>
        wasPrimed
          ? mergeNotifications(current, page.items)
          : sortByNewest(page.items),
      );
      setUnread(page.unread);
      if (!wasPrimed) {
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
      }
    },
    [applyNewItemsSideEffects, reader],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await api.notifications(reader, true, {
        limit: NOTIF_PAGE_SIZE,
        offset: nextOffset,
      });
      for (const item of page.items) seen.current.add(item.id);
      setItems((current) => mergeNotifications(current, page.items));
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
      setUnread(page.unread);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextOffset, reader]);

  useEffect(() => {
    primed.current = false;
    seen.current = new Set();
    setItems([]);
    setUnread(0);
    setHasMore(false);
    setNextOffset(null);
    refreshHead(false).catch(() => {
      setItems([]);
      setUnread(0);
    });
  }, [refreshHead]);

  useEffect(() => bindNotifySoundUnlock(), []);

  useEffect(() => {
    const client = supabase;
    const pollMs = client ? 8000 : 6000;
    const timer = window.setInterval(() => {
      refreshHead().catch(() => undefined);
      if (isAutoPrintStation()) {
        void drainAutoPrintQueue();
      }
    }, pollMs);

    if (!client) {
      return () => window.clearInterval(timer);
    }

    const channel = client
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          refreshHead().catch(() => undefined);
          if (isAutoPrintStation()) {
            void drainAutoPrintQueue();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (isAutoPrintStation()) {
            void drainAutoPrintQueue();
          }
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [refreshHead]);

  const markRead = useCallback(
    async (id: string) => {
      let shouldDecrement = false;
      setItems((current) => {
        const target = current.find((item) => item.id === id);
        shouldDecrement = Boolean(target && !target.read);
        return current.map((item) =>
          item.id === id ? { ...item, read: true } : item,
        );
      });
      try {
        await api.markNotificationRead(id, reader);
        if (shouldDecrement) setUnread((value) => Math.max(0, value - 1));
      } catch {
        void refreshHead();
      }
    },
    [reader, refreshHead],
  );

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead(reader);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
  }, [reader]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unread,
      hasMore,
      loadingMore,
      loadMore,
      markRead,
      markAllRead,
    }),
    [items, unread, hasMore, loadingMore, loadMore, markRead, markAllRead],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications precisa estar dentro de NotificationProvider");
  }
  return context;
}
