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
import { playNewOrderSound, unlockNotifySound } from "../lib/notifySound";
import { supabase } from "../lib/supabase";
import type { AppNotification } from "../types";

type NotificationContextValue = {
  items: AppNotification[];
  unread: number;
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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const reader = readerFromUser(user?.email);
  const [items, setItems] = useState<AppNotification[]>([]);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);

  const ingest = useCallback((next: AppNotification[]) => {
    const ordered = sortByNewest(next);
    if (!primed.current) {
      seen.current = new Set(ordered.map((item) => item.id));
      primed.current = true;
      setItems(ordered);
      return;
    }
    for (const item of ordered) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.type === "order_created") playNewOrderSound();
    }
    setItems(ordered);
  }, []);

  const load = useCallback(
    async (silent = true) => {
      ingest(await api.notifications(reader, silent));
    },
    [ingest, reader],
  );

  useEffect(() => {
    primed.current = false;
    seen.current = new Set();
    load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    const unlock = () => unlockNotifySound();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      const timer = window.setInterval(() => {
        load().catch(() => undefined);
      }, 6000);
      return () => window.clearInterval(timer);
    }

    const channel = client
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          load().catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  const markRead = useCallback(
    async (id: string) => {
      await api.markNotificationRead(id, reader);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
    },
    [reader],
  );

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead(reader);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  }, [reader]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unread: items.filter((item) => !item.read).length,
      markRead,
      markAllRead,
    }),
    [items, markRead, markAllRead],
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
