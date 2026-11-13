import { create } from "zustand";
import { recipeService } from "../services/index.js";
import { ApiError } from "../services/api.js";
import { handleSessionError } from "./authStore.js";
import type { Recipe, RecipeUpdateInput } from "../types/api.js";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

interface RecipeState {
  recipes: Recipe[];
  status: LoadStatus;
  error: string | null;
  /** Id of the recipe currently shown in the drawer, if any. */
  selectedRecipeId: string | null;
  /** Id of the recipe currently being mutated, used to disable its controls. */
  mutatingRecipeId: string | null;
  load: () => Promise<void>;
  select: (recipeId: string | null) => void;
  /** Returns the updated recipe, or `null` when the update failed. */
  update: (recipeId: string, changes: RecipeUpdateInput) => Promise<Recipe | null>;
  remove: (recipeId: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

let generation = 0;

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  status: "idle",
  error: null,
  selectedRecipeId: null,
  mutatingRecipeId: null,

  load: async () => {
    const id = ++generation;
    set({ status: "loading", error: null });
    try {
      const recipes = await recipeService.list();
      if (id !== generation) return;
      set({ recipes, status: "ready" });

      // Keep the selection valid when the selected recipe disappeared.
      const selected = get().selectedRecipeId;
      if (selected && !recipes.some((recipe) => recipe.id === selected)) {
        set({ selectedRecipeId: null });
      }
    } catch (error) {
      if (id !== generation) return;
      handleSessionError(error);
      set({
        status: "error",
        error: error instanceof ApiError ? error.message : "Unable to load recipes.",
      });
    }
  },

  select: (recipeId) => set({ selectedRecipeId: recipeId }),

  /**
   * Updates a recipe and replaces it in the local list so every view reflects
   * the change without a full reload.
   */
  update: async (recipeId, changes) => {
    set({ mutatingRecipeId: recipeId, error: null });
    try {
      const updated = await recipeService.update(recipeId, changes);
      set((state) => ({
        recipes: state.recipes.map((recipe) =>
          recipe.id === recipeId ? updated : recipe,
        ),
        mutatingRecipeId: null,
      }));
      return updated;
    } catch (error) {
      handleSessionError(error);
      set({
        mutatingRecipeId: null,
        error:
          error instanceof ApiError ? error.message : "Unable to update the recipe.",
      });
      return null;
    }
  },

  remove: async (recipeId) => {
    set({ mutatingRecipeId: recipeId, error: null });
    try {
      await recipeService.remove(recipeId);
      set((state) => ({
        recipes: state.recipes.filter((recipe) => recipe.id !== recipeId),
        selectedRecipeId:
          state.selectedRecipeId === recipeId ? null : state.selectedRecipeId,
        mutatingRecipeId: null,
      }));
      return true;
    } catch (error) {
      handleSessionError(error);
      set({
        mutatingRecipeId: null,
        error: error instanceof ApiError ? error.message : "Unable to delete the recipe.",
      });
      return false;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => {
    generation++;
    set({ recipes: [], status: "idle", error: null, selectedRecipeId: null, mutatingRecipeId: null });
  },
}));
