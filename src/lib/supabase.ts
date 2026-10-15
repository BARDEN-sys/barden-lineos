import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// LineOS's own Supabase project (separate from every other BARDEN app).
// The publishable key is meant to be public: row level security decides what each user sees.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://klvkehiasgkteprmxihs.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_uU2fq2_NgVKQ5q34KBbi3Q_eQ4UWqjS";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "lineos-auth" },
  });
  return client;
}
