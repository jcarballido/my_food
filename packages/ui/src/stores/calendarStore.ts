import { create } from "zustand";
import { calendarService } from "../services/index.js";
import { ApiError } from "../services/api.js";
import { handleSessionError } from "./authStore.js";
import type { CalendarRecipe } from "../types/api.js";

export interface CalendarState {
  /** 1-based month currently displayed. */
  month: number;
  year: number;
  recipes: CalendarRecipe[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** Set when a schedule was created, so the caller can refresh other views. */
  setMonth: (month: number, year: number) => void;
  load: (month?: number, year?: number) => Promise<void>;
  /** Applies a recipe change to the calendar copy without a round trip. */
  patchRecipe: (
    recipeId: string,
    changes: Partial<Pick<CalendarRecipe, "name" | "notes" | "url" | "ingredients">>,
  ) => void;
  removeRecipe: (recipeId: string) => void;
  clearError: () => void;
  reset: () => void;
}

function currentYearMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export const useCalendarStore = create<CalendarState>((set, get) => {
  const initial = currentYearMonth();
  let requestId = 0;
  let controller: AbortController | undefined;

  return {
    month: initial.month,
    year: initial.year,
    recipes: [],
    status: "idle",
    error: null,

    setMonth: (month, year) => {
      if (get().month === month && get().year === year) return;
      requestId++;
      controller?.abort();
      set({ month, year, recipes: [], status: "loading", error: null });
    },

    load: async (month, year) => {
      const targetMonth = month ?? get().month;
      const targetYear = year ?? get().year;
      const id = ++requestId;
      controller?.abort();
      controller = new AbortController();

      set({ month: targetMonth, year: targetYear, status: "loading", error: null });
      try {
        const recipes = await calendarService.getMonth(targetMonth, targetYear, controller.signal);
        if (id !== requestId) return;
        set({ recipes, status: "ready" });
      } catch (error) {
        if (id !== requestId) return;
        handleSessionError(error);
        set({
          status: "error",
          error:
            error instanceof ApiError ? error.message : "Unable to load the calendar.",
        });
      }
    },

    patchRecipe: (recipeId, changes) =>
      set((state) => ({
        recipes: state.recipes.map((recipe) =>
          recipe.id === recipeId ? { ...recipe, ...changes } : recipe,
        ),
      })),
    removeRecipe: (recipeId) =>
      set((state) => ({
        recipes: state.recipes.filter((recipe) => recipe.id !== recipeId),
      })),

    clearError: () => set({ error: null }),
    reset: () => {
      requestId++;
      controller?.abort();
      set({ recipes: [], status: "idle", error: null });
    },
  };
});
