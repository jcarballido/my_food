import {
  createIngredient,
  createRecipe,
  createRecipeWithSchedule,
  createSchedule,
  deleteIngredient,
  deleteRecipe,
  deleteSchedule,
  getIngredientById,
  getRecipeById,
  getRecipeWithIngredientsById,
  getScheduleById,
  listIngredientsByRecipeId,
  listRecipesWithIngredients,
  listSchedulesByRecipeId,
  updateIngredient,
  updateRecipeWithIngredients,
  updateSchedule,
  type CalendarRecipe,
  type CalendarWindow,
  type Database,
  type NewRecipeIngredientInput,
  type RecipeIcon,
  type RecipeIngredient,
  type RecipeSchedule,
  type RecipeWithIngredients,
  type ScheduleCook,
  type UpdateRecipeWithIngredientsInput,
} from "@my_food/database";

/** Raised when a requested resource does not exist (or is not a child of its parent). */
export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "not_found";
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Raised when a request is syntactically valid but semantically rejected. */
export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly code = "bad_request";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Raised when the request conflicts with existing state (e.g. duplicate name). */
export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "conflict";
  constructor(message = "Resource conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export interface RecipeInput {
  name: string;
  notes?: string | null;
  url?: string | null;
  icon?: RecipeIcon;
}

export interface IngredientInput {
  name: string;
  quantity?: string | null;
}

export interface ScheduleInput {
  startDate: string;
  endDate: string;
  cook?: ScheduleCook | null;
}

export class RecipeService {
  constructor(private readonly db: Database) {}

  async listRecipes(): Promise<RecipeWithIngredients[]> {
    return listRecipesWithIngredients(this.db);
  }

  async getRecipe(recipeId: string): Promise<RecipeWithIngredients> {
    const recipe = await getRecipeWithIngredientsById(this.db, recipeId);
    if (!recipe) throw new NotFoundError("Recipe not found");
    return recipe;
  }

  async createRecipe(input: RecipeInput, userId: string): Promise<RecipeWithIngredients> {
    const recipe = await createRecipe(this.db, {
      name: input.name,
      notes: input.notes ?? null,
      url: input.url ?? null,
      icon: input.icon,
      createdBy: userId,
      updatedBy: userId,
    });
    return { ...recipe, ingredients: [] };
  }

  /**
   * Creates a recipe together with its initial schedule in a single database
   * transaction. Nothing is committed if any part fails.
   */
  async createRecipeWithSchedule(
    input: RecipeInput,
    ingredients: IngredientInput[],
    schedule: ScheduleInput,
    userId: string,
  ): Promise<{ recipe: RecipeWithIngredients; schedule: RecipeSchedule }> {
    const result = await createRecipeWithSchedule(this.db, {
      recipe: {
        name: input.name,
        notes: input.notes ?? null,
        url: input.url ?? null,
        icon: input.icon,
        createdBy: userId,
        updatedBy: userId,
      },
      ingredients: ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
      })),
      schedule: {
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        cook: schedule.cook ?? null,
      },
    });

    return {
      recipe: { ...result.recipe, ingredients: result.ingredients },
      schedule: result.schedule,
    };
  }

  async updateRecipe(
    recipeId: string,
    input: UpdateRecipeWithIngredientsInput,
  ): Promise<RecipeWithIngredients> {
    const recipe = await updateRecipeWithIngredients(this.db, recipeId, input);
    if (!recipe) throw new NotFoundError("Recipe not found");
    return recipe;
  }

  async deleteRecipe(recipeId: string): Promise<void> {
    const deleted = await deleteRecipe(this.db, recipeId);
    if (!deleted) throw new NotFoundError("Recipe not found");
  }

  // Ingredients

  async listIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    await this.assertRecipeExists(recipeId);
    return listIngredientsByRecipeId(this.db, recipeId);
  }

  async createIngredient(
    recipeId: string,
    input: IngredientInput,
  ): Promise<RecipeIngredient> {
    await this.assertRecipeExists(recipeId);
    return createIngredient(this.db, {
      recipeId,
      name: input.name,
      quantity: input.quantity ?? null,
    });
  }

  async updateIngredient(
    recipeId: string,
    ingredientId: string,
    input: { name?: string; quantity?: string | null },
  ): Promise<RecipeIngredient> {
    const ingredient = await updateIngredient(this.db, recipeId, ingredientId, input);
    if (!ingredient) throw new NotFoundError("Ingredient not found");
    return ingredient;
  }

  async deleteIngredient(recipeId: string, ingredientId: string): Promise<void> {
    const deleted = await deleteIngredient(this.db, recipeId, ingredientId);
    if (!deleted) throw new NotFoundError("Ingredient not found");
  }

  // Schedules

  async listSchedules(recipeId: string): Promise<RecipeSchedule[]> {
    await this.assertRecipeExists(recipeId);
    return listSchedulesByRecipeId(this.db, recipeId);
  }

  async createSchedule(recipeId: string, input: ScheduleInput): Promise<RecipeSchedule> {
    await this.assertRecipeExists(recipeId);
    return createSchedule(this.db, {
      recipeId,
      startDate: input.startDate,
      endDate: input.endDate,
      cook: input.cook ?? null,
    });
  }

  async updateSchedule(
    recipeId: string,
    scheduleId: string,
    input: { startDate?: string; endDate?: string; cook?: ScheduleCook | null },
  ): Promise<RecipeSchedule> {
    const existing = await getScheduleById(this.db, recipeId, scheduleId);
    if (!existing) throw new NotFoundError("Schedule not found");

    const nextStart = input.startDate ?? existing.startDate;
    const nextEnd = input.endDate ?? existing.endDate;
    if (nextEnd < nextStart) {
      throw new ValidationError("end_date cannot precede start_date");
    }

    const schedule = await updateSchedule(this.db, recipeId, scheduleId, input);
    if (!schedule) throw new NotFoundError("Schedule not found");
    return schedule;
  }

  async deleteSchedule(recipeId: string, scheduleId: string): Promise<void> {
    const deleted = await deleteSchedule(this.db, recipeId, scheduleId);
    if (!deleted) throw new NotFoundError("Schedule not found");
  }

  private async assertRecipeExists(recipeId: string): Promise<void> {
    const recipe = await getRecipeById(this.db, recipeId);
    if (!recipe) throw new NotFoundError("Recipe not found");
  }
}

export type { CalendarRecipe, CalendarWindow, NewRecipeIngredientInput };
