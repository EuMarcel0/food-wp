import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseReady =
  Boolean(url) &&
  Boolean(anonKey) &&
  !url.includes("your-project-id") &&
  !anonKey.startsWith("your-");

export const supabase = supabaseReady
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let topicSeq = 0;

/**
 * O realtime-js reaproveita o canal existente com o mesmo tópico, e o
 * removeChannel só o tira da lista após o ack do servidor. Remontar com o
 * mesmo nome pega o canal antigo (saindo) e para de receber eventos.
 */
export function realtimeTopic(name: string) {
  topicSeq += 1;
  return `${name}:${Date.now().toString(36)}${topicSeq}`;
}
