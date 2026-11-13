import { useEffect } from "react";
import { config } from "../config/env.js";
import { useAuthStore } from "../stores/authStore.js";

/**
 * Cleans up the URL after the magic-link callback.
 *
 * Supabase redirects back to `VITE_AUTH_CALLBACK_URL` with the session in the
 * URL fragment (or a `?code=` query parameter). Once the session has been
 * established, those parameters are removed so they are not leaked through
 * history entries, shared links or the browser's address bar.
 */
export function useAuthCallbackCleanup(): void {
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status !== "authenticated") return;

    const callbackPath = new URL(config.authCallbackUrl, window.location.origin).pathname;
    const current = new URL(window.location.href);

    const hasSessionParams =
      current.hash.length > 1 || current.searchParams.has("code") || current.searchParams.has("token_hash");

    if (!hasSessionParams) return;

    const target = new URL(window.location.origin + (current.pathname === callbackPath ? "/" : current.pathname));
    target.search = current.searchParams.has("code") ? "" : current.search;
    target.hash = "";

    window.history.replaceState({}, "", target.toString());
  }, [status]);
}
