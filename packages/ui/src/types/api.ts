/**
 * Shared API types.
 *
 * These mirror the server contract documented in `API.md`. Field names are
 * `snake_case` because that is the wire format.
 */

/** Icons a recipe can display in the recipe drawer. */
export type RecipeIconName = "utensils" | "fish" | "beef" | "egg";

/** Optional cook assigned to a scheduled meal (not to the recipe). */
export type ScheduleCook = "J" | "H";

export interface Ingredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string | null;
}

export interface Schedule {
  id: string;
  recipe_id: string;
  start_date: string;
  end_date: string;
  /** Optional cook for this scheduled meal; independent of the recipe. */
  cook: ScheduleCook | null;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  notes: string | null;
  url: string | null;
  icon: RecipeIconName;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  ingredients: Ingredient[];
}

export interface CalendarRecipe extends Recipe {
  schedules: Schedule[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Payload used when creating a recipe together with its first schedule. */
export interface RecipeWithScheduleInput {
  recipe: {
    name: string;
    notes: string | null;
    url: string | null;
    icon?: RecipeIconName;
  };
  ingredients: Array<{ name: string; quantity: string | null }>;
  schedule: {
    start_date: string;
    end_date: string;
    cook?: ScheduleCook | null;
  };
}

/** Payload used when updating a recipe. Omitted fields are left untouched. */
export interface RecipeUpdateInput {
  name?: string;
  notes?: string | null;
  url?: string | null;
  icon?: RecipeIconName;
  ingredients?: Array<{ name: string; quantity: string | null }>;
}
