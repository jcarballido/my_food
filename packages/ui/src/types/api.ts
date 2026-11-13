/**
 * Shared API types.
 *
 * These mirror the server contract documented in `API.md`. Field names are
 * `snake_case` because that is the wire format.
 */

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
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  notes: string | null;
  url: string | null;
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
  };
  ingredients: Array<{ name: string; quantity: string | null }>;
  schedule: {
    start_date: string;
    end_date: string;
  };
}

/** Payload used when updating a recipe. Omitted fields are left untouched. */
export interface RecipeUpdateInput {
  name?: string;
  notes?: string | null;
  url?: string | null;
  ingredients?: Array<{ name: string; quantity: string | null }>;
}
