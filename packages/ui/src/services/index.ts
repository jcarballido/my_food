import { api } from "./api.js";
import type {
  CalendarRecipe,
  Ingredient,
  Recipe,
  RecipeUpdateInput,
  RecipeWithScheduleInput,
  Schedule,
} from "../types/api.js";

/**
 * Domain services.
 *
 * All HTTP communication lives here so components never deal with URLs,
 * payloads or response envelopes directly.
 */

export const recipeService = {
  async list(): Promise<Recipe[]> {
    const { recipes } = await api.get<{ recipes: Recipe[] }>("/api/recipes");
    return recipes;
  },

  async getById(id: string): Promise<Recipe> {
    const { recipe } = await api.get<{ recipe: Recipe }>(`/api/recipes/${id}`);
    return recipe;
  },

  async create(input: {
    name: string;
    notes: string | null;
    url: string | null;
  }): Promise<Recipe> {
    const { recipe } = await api.post<{ recipe: Recipe }>("/api/recipes", input);
    return recipe;
  },

  /** Creates a recipe and its first schedule as a single atomic operation. */
  async createWithSchedule(input: RecipeWithScheduleInput): Promise<{
    recipe: Recipe;
    schedule: Schedule;
  }> {
    return api.post<{ recipe: Recipe; schedule: Schedule }>(
      "/api/recipes/with-schedule",
      input,
    );
  },

  async update(id: string, input: RecipeUpdateInput): Promise<Recipe> {
    const { recipe } = await api.patch<{ recipe: Recipe }>(`/api/recipes/${id}`, input);
    return recipe;
  },

  async remove(id: string): Promise<void> {
    await api.delete<void>(`/api/recipes/${id}`);
  },

  async listIngredients(recipeId: string): Promise<Ingredient[]> {
    const { ingredients } = await api.get<{ ingredients: Ingredient[] }>(
      `/api/recipes/${recipeId}/ingredients`,
    );
    return ingredients;
  },

  /** Adds a schedule to an existing recipe. */
  async createSchedule(
    recipeId: string,
    input: { start_date: string; end_date: string },
  ): Promise<Schedule> {
    const { schedule } = await api.post<{ schedule: Schedule }>(
      `/api/recipes/${recipeId}/schedules`,
      input,
    );
    return schedule;
  },

  async listSchedules(recipeId: string): Promise<Schedule[]> {
    const { schedules } = await api.get<{ schedules: Schedule[] }>(
      `/api/recipes/${recipeId}/schedules`,
    );
    return schedules;
  },
};

export const calendarService = {
  /** Retrieves recipes scheduled within the given calendar month. */
  async getMonth(month: number, year: number, signal?: AbortSignal): Promise<CalendarRecipe[]> {
    const { recipes } = await api.get<{ recipes: CalendarRecipe[] }>(
      `/api/calendar?month=${month}&year=${year}`,
      signal,
    );
    return recipes;
  },
};

export const authService = {
  /**
   * Requests a magic link. The server enforces the allowlist and initiates the
   * sign-in with the provider.
   */
  async requestMagicLink(email: string): Promise<void> {
    // console.log('EMAIL RECIEVED:')
    // console.log(email)
    // return
    try {
      await api.post<{ ok: boolean }>("/api/auth/magic-link", { email }, { anonymous: true });      
    } catch (error) {
      console.log("ERROR:")
      console.log(error)
    }
  },
};
