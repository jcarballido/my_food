import type { RecipeIngredient, RecipeSchedule } from "@my_food/database";
import { toIsoTimestamp } from "../utils/timestamps.js";

/**
 * API representations.
 *
 * The wire format uses `snake_case` (see `API.md`), while the database package
 * exposes `camelCase` columns. These mappers are the single place where the
 * two vocabularies meet, so the mapping stays consistent across every route.
 */

export interface ApiIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string | null;
}

export interface ApiSchedule {
  id: string;
  recipe_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface ApiRecipe {
  id: string;
  name: string;
  notes: string | null;
  url: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  ingredients: ApiIngredient[];
}

export interface ApiCalendarRecipe extends ApiRecipe {
  schedules: ApiSchedule[];
}

export function toApiIngredient(ingredient: RecipeIngredient): ApiIngredient {
  return {
    id: ingredient.id,
    recipe_id: ingredient.recipeId,
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
  };
}

export function toApiSchedule(schedule: RecipeSchedule): ApiSchedule {
  return {
    id: schedule.id,
    recipe_id: schedule.recipeId,
    start_date: schedule.startDate,
    end_date: schedule.endDate,
    created_at: toIsoTimestamp(schedule.createdAt),
    updated_at: toIsoTimestamp(schedule.updatedAt),
  };
}

export function toApiRecipe(recipe: {
  id: string;
  name: string;
  notes: string | null;
  url: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  ingredients?: RecipeIngredient[];
}): ApiRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    notes: recipe.notes ?? null,
    url: recipe.url ?? null,
    created_by: recipe.createdBy,
    updated_by: recipe.updatedBy,
    created_at: toIsoTimestamp(recipe.createdAt),
    updated_at: toIsoTimestamp(recipe.updatedAt),
    ingredients: (recipe.ingredients ?? []).map(toApiIngredient),
  };
}

export function toApiCalendarRecipe(recipe: {
  id: string;
  name: string;
  notes: string | null;
  url: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
  schedules: RecipeSchedule[];
}): ApiCalendarRecipe {
  return {
    ...toApiRecipe(recipe),
    schedules: recipe.schedules.map(toApiSchedule),
  };
}
