import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { env, flags } from "../config/env.js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!flags.supabaseReady) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport: ws as unknown as typeof WebSocket,
      },
    });
  }
  return client;
}
