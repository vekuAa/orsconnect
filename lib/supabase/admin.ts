import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Variable serveur SUPABASE_SECRET_KEY manquante.");
  }

  return createSupabaseClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
