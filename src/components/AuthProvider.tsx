"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getProfile, setDisplayName, type Profile } from "@/lib/cloud";
import { supabase } from "@/lib/supabase";
import { setCurrentUser } from "@/lib/user";

// Crew logins: a 6-digit code (or a sign-in link) by email. Codes are typed into the app, so
// it works from the installed home-screen app. (Text-message codes are not used.)

type Auth = {
  ready: boolean;
  userId: string | null;
  profile: Profile | null;
  displayName: string;
  sendCode: (to: string) => Promise<{ ok: boolean; error?: string; channel: "email" | "sms" }>;
  verifyCode: (to: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  saveName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

/** "(813) 555-0100" -> "+18135550100"; anything with @ is an email. */
export function normalizeContact(raw: string): { channel: "email" | "sms"; value: string } {
  const v = raw.trim();
  if (v.includes("@")) return { channel: "email", value: v.toLowerCase() };
  const digits = v.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return { channel: "sms", value: digits };
  const d = digits.replace(/\D/g, "");
  return { channel: "sms", value: d.length === 10 ? `+1${d}` : `+${d}` };
}

function friendlyAuthError(msg: string): string {
  if (/sms|phone provider|twilio|unsupported phone/i.test(msg)) return "Text codes aren't switched on yet. Use your email for now.";
  if (/rate limit|too many/i.test(msg)) return "Too many codes sent. Wait a few minutes and try again.";
  if (/expired|invalid/i.test(msg)) return "That code didn't work or has expired. Send a new one.";
  if (/Failed to fetch|network|Load failed/i.test(msg)) return "No signal. Signing in needs a connection.";
  return msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setCurrentUser(null);
      return;
    }
    try {
      const p = await getProfile(id);
      setProfile(p);
      setCurrentUser(p?.display_name || p?.email || p?.phone);
      try {
        localStorage.setItem("lineos-name", p?.display_name || p?.email || p?.phone || "");
      } catch {}
    } catch {
      // Offline: keep the name from last time.
      try {
        setCurrentUser(localStorage.getItem("lineos-name"));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      setUserId(id);
      void loadProfile(id).finally(() => setReady(true));
    });
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      setUserId((prev) => {
        if (prev !== id) void loadProfile(id);
        return id;
      });
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const sendCode = useCallback(async (to: string) => {
    const c = normalizeContact(to);
    if (c.channel !== "email") return { ok: false, error: "Enter your email address.", channel: c.channel };
    const res = await supabase().auth.signInWithOtp({
      email: c.value,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/login` },
    });
    return res.error ? { ok: false, error: friendlyAuthError(res.error.message), channel: c.channel } : { ok: true, channel: c.channel };
  }, []);

  const verifyCode = useCallback(async (to: string, code: string) => {
    const c = normalizeContact(to);
    const token = code.replace(/\D/g, "");
    const sb = supabase();
    const res = await sb.auth.verifyOtp({ email: c.value, token, type: "email" });
    if (res.error) return { ok: false, error: friendlyAuthError(res.error.message) };
    const id = res.data.user?.id ?? null;
    setUserId(id);
    await loadProfile(id);
    return { ok: true };
  }, [loadProfile]);

  const saveName = useCallback(
    async (name: string) => {
      if (!userId) return;
      await setDisplayName(userId, name);
      await loadProfile(userId);
    },
    [userId, loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setUserId(null);
    setProfile(null);
    setCurrentUser(null);
  }, []);

  const displayName = profile?.display_name || profile?.email || profile?.phone || "";

  return (
    <AuthContext.Provider value={{ ready, userId, profile, displayName, sendCode, verifyCode, saveName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
