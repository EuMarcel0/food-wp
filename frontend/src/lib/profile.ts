import { createAvatar } from "@dicebear/core";
import * as adventurerNeutral from "@dicebear/adventurer-neutral";
import type { User } from "@supabase/supabase-js";

const generated = new Map<string, string>();

export function generatedAvatar(seed: string) {
  const key = seed.trim() || "food-wp";
  const cached = generated.get(key);
  if (cached) return cached;
  const uri = createAvatar(adventurerNeutral, {
    seed: key,
    size: 128,
    backgroundColor: ["fff1e0", "ffe0c2", "f4f4f5"],
  }).toDataUri();
  generated.set(key, uri);
  return uri;
}

export function displayName(user: User | null | undefined) {
  const meta = user?.user_metadata ?? {};
  const full = meta.full_name ?? meta.name;
  if (typeof full === "string" && full.trim()) return full.trim();
  return user?.email?.split("@")[0] || "Equipe";
}

export function getAvatarUrl(user: User | null | undefined) {
  const uploaded = user?.user_metadata?.avatar_url;
  if (typeof uploaded === "string" && uploaded.trim()) return uploaded;
  return generatedAvatar(user?.id || user?.email || "food-wp");
}
