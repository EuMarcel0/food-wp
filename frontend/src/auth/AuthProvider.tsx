import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { translateAuthError } from "../lib/authErrors";
import { resizeImage } from "../lib/image";
import { supabase, supabaseReady } from "../lib/supabase";

type AuthContextValue = {
  ready: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<"session" | "confirm">;
  signOut: () => Promise<void>;
  updateProfile: (input: {
    fullName: string;
    avatarUrl?: string;
  }) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseReady);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready: supabaseReady,
      loading,
      session,
      user: session?.user ?? null,
      async signIn(email, password) {
        if (!supabase) throw new Error("Autenticação ainda não foi configurada.");
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(translateAuthError(error));
      },
      async signUp(email, password, name) {
        if (!supabase) throw new Error("Autenticação ainda não foi configurada.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: name.trim(),
              avatar_style: "dicebear-adventurer-neutral",
            },
          },
        });
        if (error) throw new Error(translateAuthError(error));
        return data.session ? "session" : "confirm";
      },
      async signOut() {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(translateAuthError(error));
      },
      async updateProfile(input) {
        if (!supabase) throw new Error("Autenticação ainda não foi configurada.");
        const { error } = await supabase.auth.updateUser({
          data: {
            full_name: input.fullName.trim(),
            ...(input.avatarUrl ? { avatar_url: input.avatarUrl } : {}),
          },
        });
        if (error) throw new Error(translateAuthError(error));
      },
      async changePassword(currentPassword, newPassword) {
        if (!supabase) throw new Error("Autenticação ainda não foi configurada.");
        const email = session?.user.email;
        if (!email) throw new Error("Sessão expirada. Entre novamente.");
        const { error: currentError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (currentError) throw new Error(translateAuthError(currentError));
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw new Error(translateAuthError(error));
        const { error: outError } = await supabase.auth.signOut();
        if (outError) throw new Error(translateAuthError(outError));
      },
      async uploadAvatar(file) {
        if (!supabase) throw new Error("Autenticação ainda não foi configurada.");
        const userId = session?.user.id;
        if (!userId) throw new Error("Sessão expirada. Entre novamente.");
        const prepared = await resizeImage(file);
        const path = `${userId}/avatar.jpg`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(path, prepared, {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (error) {
          throw new Error(
            "Não foi possível enviar a foto. Tente de novo em instantes.",
          );
        }
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        return `${data.publicUrl}?t=${Date.now()}`;
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
}
