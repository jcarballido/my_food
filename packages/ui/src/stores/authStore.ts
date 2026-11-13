import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../services/supabase.js";
import { authService } from "../services/index.js";
import { ApiError } from "../services/api.js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  /** Message shown on the login screen after a magic link was requested. */
  notice: string | null;
  error: string | null;
  submitting: boolean;
  setSession: (session: Session | null) => void;
  requestMagicLink: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  status: "loading",
  notice: null,
  error: null,
  submitting: false,

  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? "authenticated" : "unauthenticated",
    }),

  /**
   * Asks the server to start a magic-link sign-in. The allowlist is enforced
   * server-side, so a rejected address simply reports a generic failure.
   */
  requestMagicLink: async (email) => {
    set({ submitting: true, error: null, notice: null });
    try {
      await authService.requestMagicLink(email);
      set({
        submitting: false,
        notice: `Check your inbox for a sign-in link sent to ${email}.`,
      });
      return true;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Unable to send the sign-in link. Please try again.";
      set({ submitting: false, error: message });
      return false;
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      set({ session: null, user: null, status: "unauthenticated", notice: null, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * Signs the user out when the server rejects the session.
 *
 * An expired or revoked session must return the user to the authentication
 * screen rather than leaving the application in a broken state.
 */
export function handleSessionError(error: unknown): void {
  if (error instanceof ApiError && error.isAuthError) {
    void useAuthStore.getState().signOut();
  }
}
