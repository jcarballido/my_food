import { useEffect, useState } from "react";
import { CalendarPanel } from "./components/calendar/CalendarPanel.js";
import { RecipeDrawer } from "./components/recipe/RecipeDrawer.js";
import { ScheduleModal } from "./components/modals/ScheduleModal.js";
import { ConfirmDialog } from "./components/ui/ConfirmDialog.js";
import { LoginScreen } from "./components/auth/LoginScreen.js";
import { Spinner } from "./components/ui/Feedback.js";
import { useAuthStore } from "./stores/authStore.js";
import { useRecipeStore } from "./stores/recipeStore.js";
import { useUiStore } from "./stores/uiStore.js";
import { useAuthCallbackCleanup } from "./hooks/useAuthCallbackCleanup.js";
import { supabase } from "./services/supabase.js";
import { useCalendarStore } from "./stores/calendarStore.js";

/**
 * Application shell.
 *
 * Owns the session lifecycle: the Supabase client restores the session on
 * load (including the magic-link callback), and the app renders the calendar
 * and drawer only once a session exists.
 */
export function App() {
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);
  const signOut = useAuthStore((state) => state.signOut);

  const loadRecipes = useRecipeStore((state) => state.load);
  const recipeError = useRecipeStore((state) => state.error);
  const drawerOpen = useUiStore((state) => state.drawerOpen);
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const confirmDialog = useUiStore((state) => state.confirmDialog);
  const closeConfirmDialog = useUiStore((state) => state.closeConfirmDialog);
  const navigate = useUiStore((state) => state.navigate);

  const [confirmBusy, setConfirmBusy] = useState(false);

  // Keep the auth store in sync with the Supabase session.
  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      if (error) useAuthStore.setState({ error: "This sign-in link is invalid or expired. Request a new link." });
    }).catch(() => {
      if (!active) return;
      setSession(null);
      useAuthStore.setState({ error: "Unable to restore your session. Please sign in again." });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [setSession]);

  // Load the recipe list once the user is authenticated.
  useEffect(() => {
    if (status === "authenticated") {
      void loadRecipes();
    } else if (status === "unauthenticated") {
      useRecipeStore.getState().reset();
      useCalendarStore.getState().reset();
      useUiStore.setState({
        confirmDialog: null,
        scheduleModalOpen: false,
        scheduleModalSchedule: null,
        scheduleModalRecipeId: null,
        scheduleModalDate: null,
        recipeDirty: false,
      });
    }
  }, [status, loadRecipes]);

  // Strip the magic-link parameters from the URL once the session exists.
  useAuthCallbackCleanup();

  if (status === "loading") {
    return (
      <main className="flex min-h-full items-center justify-center">
        <Spinner label="Loading" />
      </main>
    );
  }

  if (status === "unauthenticated" || !session) {
    return <LoginScreen />;
  }

  const handleConfirm = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-transparent text-ink">
      <header className="flex items-center justify-between gap-4 border-b border-line/80 bg-cream/75 px-4 py-3.5 backdrop-blur-sm sm:px-6">
        <h1 className="text-3xl font-medium tracking-tight text-ink">
          Dnnr<span className="text-clay">.</span>
        </h1>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-line bg-paper/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted sm:inline">
            {session.user.email}
          </span>
          <button type="button" onClick={() => navigate(() => void signOut().catch(() => undefined))} className="btn-secondary">
            Sign out
          </button>
          <button
            type="button"
            onClick={toggleDrawer}
            className="btn-primary"
            aria-expanded={drawerOpen}
            aria-controls="recipe-drawer"
          >
            {drawerOpen ? "Hide recipes" : "Show recipes"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-5 lg:p-5">
        <CalendarPanel />

        <div id="recipe-drawer" className={drawerOpen ? "flex min-h-0" : "hidden"}>
          <RecipeDrawer open={drawerOpen} />
        </div>
      </div>

      <ScheduleModal />

      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmLabel={confirmDialog?.confirmLabel ?? "Confirm"}
        destructive={confirmDialog?.destructive}
        busy={confirmBusy}
        error={confirmDialog?.destructive ? recipeError : null}
        onConfirm={handleConfirm}
        onCancel={closeConfirmDialog}
      />
    </div>
  );
}
