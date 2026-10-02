import { useEffect, useRef } from "react";
import { drainAutoPrintQueue } from "../lib/autoPrint";
import { isAutoPrintStation } from "../lib/printAgent";
import {
  bindNotifySoundUnlock,
  playKitchenPrintSound,
  playNewOrderSound,
} from "../lib/notifySound";
import { realtimeTopic, supabase } from "../lib/supabase";

const DRAIN_INTERVAL_MS = 10_000;
const PRINTED_SOUND_WINDOW_MS = 2 * 60_000;

type OrderRow = { id?: string; auto_printed_at?: string | null };

/**
 * Alertas de pedido sem depender do feed de notificações:
 * som de novo pedido, bip quando o agente imprime e fila de auto-impressão.
 */
export function OrderAlerts() {
  const printedSounded = useRef(new Set<string>());

  useEffect(() => bindNotifySoundUnlock(), []);

  useEffect(() => {
    const drain = () => {
      if (isAutoPrintStation()) void drainAutoPrintQueue();
    };
    drain();
    const timer = window.setInterval(drain, DRAIN_INTERVAL_MS);

    const client = supabase;
    if (!client) return () => window.clearInterval(timer);

    const channel = client
      .channel(realtimeTopic("order-alerts"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => {
          playNewOrderSound();
          drain();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          drain();
          const row = payload.new as OrderRow;
          if (!row.id || !row.auto_printed_at) return;
          if (printedSounded.current.has(row.id)) return;
          const printedAt = Date.parse(row.auto_printed_at);
          if (!printedAt || Date.now() - printedAt > PRINTED_SOUND_WINDOW_MS) return;
          printedSounded.current.add(row.id);
          if (isAutoPrintStation()) playKitchenPrintSound();
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, []);

  return null;
}
