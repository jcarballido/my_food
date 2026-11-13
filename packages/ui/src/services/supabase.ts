import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";

/**
 * Supabase browser client.
 *
 * Used only for session establishment and the magic-link callback. The UI
 * never talks to the database directly — all data flows through the server.
 */
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // The server initiates the link; the browser has no PKCE verifier.
      flowType: "implicit",
    },
  },
);

/** Returns the current access token, or `null` when there is no session. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
