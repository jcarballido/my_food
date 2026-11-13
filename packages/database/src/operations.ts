import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { DatabaseSchema } from "./db.js";
import {
  recipeIngredients,
  recipeSchedules,
  recipes,
  type NewRecipeIngredient,
  type NewRecipeSchedule,
  type Recipe,
  type RecipeIngredient,
  type RecipeSchedule,
} from "./schema.js";

/**
 * Executor accepted by every operation.
 *
 * `PgDatabase` is the common supertype of the pooled connection and of an
 * in-flight transaction, so the same operation helpers can be reused inside
 * `db.transaction(...)` without duplicating query code.
 */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT, DatabaseSchema>;

export interface CreateRecipeInput {
  name: string;
  notes?: string | null;
  url?: string | null;
  createdBy: string;
  updatedBy?: string;
}

export interface UpdateRecipeInput {
  name?: string;
  notes?: string | null;
  url?: string | null;
  updatedBy: string;
}

export interface CreateRecipeIngredientInput {
  recipeId: string;
  name: string;
  quantity?: string | null;
}

export interface NewRecipeIngredientInput {
  name: string;
  quantity?: string | null;
}

export interface UpdateRecipeIngredientInput {
  name?: string;
  quantity?: string | null;
}

export interface UpdateRecipeWithIngredientsInput {
  name?: string;
  notes?: string | null;
  url?: string | null;
  updatedBy: string;
  /** When provided, replaces the recipe's complete ingredient set. */
  ingredients?: NewRecipeIngredientInput[];
}

export interface CreateRecipeScheduleInput {
  recipeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface NewRecipeScheduleInput {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface UpdateRecipeScheduleInput {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

export interface CalendarRecipe extends Recipe {
  ingredients: RecipeIngredient[];
  schedules: RecipeSchedule[];
}

export interface CreateRecipeWithScheduleInput {
  recipe: CreateRecipeInput;
  ingredients?: NewRecipeIngredientInput[];
  schedule: NewRecipeScheduleInput;
}

export interface CreateRecipeWithScheduleResult {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  schedule: RecipeSchedule;
}

export interface CalendarWindow {
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
}

async function assertRecipeExists(db: DbExecutor, recipeId: string): Promise<void> {
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  if (!row) {
    throw new Error(`Recipe not found: ${recipeId}`);
  }
}

// Recipes
export async function createRecipe(
  db: DbExecutor,
  input: CreateRecipeInput,
): Promise<Recipe> {
  const [row] = await db
    .insert(recipes)
    .values({
      name: input.name,
      notes: input.notes ?? null,
      url: input.url ?? null,
      createdBy: input.createdBy,
      updatedBy: input.updatedBy ?? input.createdBy,
    })
    .returning();
  return row;
}

export async function getRecipeById(
  db: DbExecutor,
  recipeId: string,
): Promise<Recipe | undefined> {
  const [row] = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  return row;
}

export async function getRecipeWithIngredientsById(
  db: DbExecutor,
  recipeId: string,
): Promise<RecipeWithIngredients | undefined> {
  const recipe = await getRecipeById(db, recipeId);
  if (!recipe) return undefined;
  const ingredients = await listIngredientsByRecipeId(db, recipeId);
  return { ...recipe, ingredients };
}

export async function listRecipes(db: DbExecutor): Promise<Recipe[]> {
  return db.select().from(recipes).orderBy(asc(recipes.name), asc(recipes.createdAt));
}

export async function listRecipesWithIngredients(
  db: DbExecutor,
): Promise<RecipeWithIngredients[]> {
  const allRecipes = await listRecipes(db);
  if (allRecipes.length === 0) return [];

  const ids = allRecipes.map((r) => r.id);
  const allIngredients = await db
    .select()
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, ids))
    .orderBy(asc(recipeIngredients.name), asc(recipeIngredients.id));

  const byRecipe = new Map<string, RecipeIngredient[]>();
  for (const ing of allIngredients) {
    const list = byRecipe.get(ing.recipeId) ?? [];
    list.push(ing);
    byRecipe.set(ing.recipeId, list);
  }

  return allRecipes.map((r) => ({ ...r, ingredients: byRecipe.get(r.id) ?? [] }));
}

export async function updateRecipe(
  db: DbExecutor,
  recipeId: string,
  input: UpdateRecipeInput,
): Promise<Recipe | undefined> {
  const updateData: Partial<typeof recipes.$inferInsert> = {
    updatedBy: input.updatedBy,
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.url !== undefined) updateData.url = input.url;

  const [row] = await db
    .update(recipes)
    .set(updateData)
    .where(eq(recipes.id, recipeId))
    .returning();
  return row;
}

export async function deleteRecipe(
  db: DbExecutor,
  recipeId: string,
): Promise<boolean> {
  const rows = await db
    .delete(recipes)
    .where(eq(recipes.id, recipeId))
    .returning({ id: recipes.id });
  return rows.length > 0;
}

// Ingredients
export async function listIngredientsByRecipeId(
  db: DbExecutor,
  recipeId: string,
): Promise<RecipeIngredient[]> {
  return db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId))
    .orderBy(asc(recipeIngredients.name), asc(recipeIngredients.id));
}

export async function getIngredientById(
  db: DbExecutor,
  recipeId: string,
  ingredientId: string,
): Promise<RecipeIngredient | undefined> {
  const [row] = await db
    .select()
    .from(recipeIngredients)
    .where(
      and(
        eq(recipeIngredients.id, ingredientId),
        eq(recipeIngredients.recipeId, recipeId),
      ),
    )
    .limit(1);
  return row;
}

export async function createIngredient(
  db: DbExecutor,
  input: CreateRecipeIngredientInput,
): Promise<RecipeIngredient> {
  await assertRecipeExists(db, input.recipeId);
  const [row] = await db
    .insert(recipeIngredients)
    .values({
      recipeId: input.recipeId,
      name: input.name,
      quantity: input.quantity ?? null,
    })
    .returning();
  return row;
}

export async function updateIngredient(
  db: DbExecutor,
  recipeId: string,
  ingredientId: string,
  input: UpdateRecipeIngredientInput,
): Promise<RecipeIngredient | undefined> {
  const updateData: Partial<NewRecipeIngredient> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.quantity !== undefined) updateData.quantity = input.quantity;
  if (Object.keys(updateData).length === 0) {
    return getIngredientById(db, recipeId, ingredientId);
  }

  const [row] = await db
    .update(recipeIngredients)
    .set(updateData)
    .where(
      and(
        eq(recipeIngredients.id, ingredientId),
        eq(recipeIngredients.recipeId, recipeId),
      ),
    )
    .returning();
  return row;
}

export async function deleteIngredient(
  db: DbExecutor,
  recipeId: string,
  ingredientId: string,
): Promise<boolean> {
  const rows = await db
    .delete(recipeIngredients)
    .where(
      and(
        eq(recipeIngredients.id, ingredientId),
        eq(recipeIngredients.recipeId, recipeId),
      ),
    )
    .returning({ id: recipeIngredients.id });
  return rows.length > 0;
}

export async function replaceRecipeIngredients(
  db: DbExecutor,
  recipeId: string,
  ingredients: NewRecipeIngredientInput[],
): Promise<RecipeIngredient[]> {
  await db
    .delete(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId));
  if (ingredients.length === 0) return [];
  const values = ingredients.map((i) => ({
    recipeId,
    name: i.name,
    quantity: i.quantity ?? null,
  }));
  return db.insert(recipeIngredients).values(values).returning();
}

/**
 * Atomically updates a recipe and, when supplied, replaces its complete
 * ingredient set. Either both changes are committed or neither is.
 */
export async function updateRecipeWithIngredients(
  db: DbExecutor,
  recipeId: string,
  input: UpdateRecipeWithIngredientsInput,
): Promise<RecipeWithIngredients | undefined> {
  return db.transaction(async (tx) => {
    const updateData: Partial<typeof recipes.$inferInsert> = {
      updatedBy: input.updatedBy,
      updatedAt: new Date().toISOString(),
    };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.url !== undefined) updateData.url = input.url;

    const [updated] = await tx
      .update(recipes)
      .set(updateData)
      .where(eq(recipes.id, recipeId))
      .returning();
    if (!updated) return undefined;

    if (input.ingredients !== undefined) {
      await replaceRecipeIngredients(tx, recipeId, input.ingredients);
    }

    const ingredients = await listIngredientsByRecipeId(tx, recipeId);
    return { ...updated, ingredients };
  });
}

// Schedules
export async function listSchedulesByRecipeId(
  db: DbExecutor,
  recipeId: string,
): Promise<RecipeSchedule[]> {
  return db
    .select()
    .from(recipeSchedules)
    .where(eq(recipeSchedules.recipeId, recipeId))
    .orderBy(asc(recipeSchedules.startDate), asc(recipeSchedules.endDate), asc(recipeSchedules.id));
}

export async function getScheduleById(
  db: DbExecutor,
  recipeId: string,
  scheduleId: string,
): Promise<RecipeSchedule | undefined> {
  const [row] = await db
    .select()
    .from(recipeSchedules)
    .where(
      and(
        eq(recipeSchedules.id, scheduleId),
        eq(recipeSchedules.recipeId, recipeId),
      ),
    )
    .limit(1);
  return row;
}

export async function createSchedule(
  db: DbExecutor,
  input: CreateRecipeScheduleInput,
): Promise<RecipeSchedule> {
  await assertRecipeExists(db, input.recipeId);
  const [row] = await db
    .insert(recipeSchedules)
    .values({
      recipeId: input.recipeId,
      startDate: input.startDate,
      endDate: input.endDate,
    })
    .returning();
  return row;
}

export async function updateSchedule(
  db: DbExecutor,
  recipeId: string,
  scheduleId: string,
  input: UpdateRecipeScheduleInput,
): Promise<RecipeSchedule | undefined> {
  const updateData: Partial<NewRecipeSchedule> & { updatedAt?: string } = {
    updatedAt: new Date().toISOString(),
  };
  if (input.startDate !== undefined) updateData.startDate = input.startDate;
  if (input.endDate !== undefined) updateData.endDate = input.endDate;

  const [row] = await db
    .update(recipeSchedules)
    .set(updateData)
    .where(
      and(
        eq(recipeSchedules.id, scheduleId),
        eq(recipeSchedules.recipeId, recipeId),
      ),
    )
    .returning();
  return row;
}

export async function deleteSchedule(
  db: DbExecutor,
  recipeId: string,
  scheduleId: string,
): Promise<boolean> {
  const rows = await db
    .delete(recipeSchedules)
    .where(
      and(
        eq(recipeSchedules.id, scheduleId),
        eq(recipeSchedules.recipeId, recipeId),
      ),
    )
    .returning({ id: recipeSchedules.id });
  return rows.length > 0;
}

// Composite transactional operation for POST /api/recipes/with-schedule
export async function createRecipeWithSchedule(
  db: DbExecutor,
  input: CreateRecipeWithScheduleInput,
): Promise<CreateRecipeWithScheduleResult> {
  return db.transaction(async (tx) => {
    const [recipe] = await tx
      .insert(recipes)
      .values({
        name: input.recipe.name,
        notes: input.recipe.notes ?? null,
        url: input.recipe.url ?? null,
        createdBy: input.recipe.createdBy,
        updatedBy: input.recipe.updatedBy ?? input.recipe.createdBy,
      })
      .returning();

    let ingredients: RecipeIngredient[] = [];
    if (input.ingredients && input.ingredients.length > 0) {
      ingredients = await tx
        .insert(recipeIngredients)
        .values(
          input.ingredients.map((i) => ({
            recipeId: recipe.id,
            name: i.name,
            quantity: i.quantity ?? null,
          })),
        )
        .returning();
    }

    const [schedule] = await tx
      .insert(recipeSchedules)
      .values({
        recipeId: recipe.id,
        startDate: input.schedule.startDate,
        endDate: input.schedule.endDate,
      })
      .returning();

    return { recipe, ingredients, schedule };
  });
}

// Calendar-month overlap query support for GET /api/calendar?month=&year=
// Server must calculate window start/end (YYYY-MM-DD) using app timezone.
export async function listCalendarRecipes(
  db: DbExecutor,
  window: CalendarWindow,
): Promise<CalendarRecipe[]> {
  const overlapping = await db
    .select({ recipeId: recipeSchedules.recipeId })
    .from(recipeSchedules)
    .where(
      and(
        lte(recipeSchedules.startDate, window.end),
        gte(recipeSchedules.endDate, window.start),
      ),
    );

  const recipeIds = [...new Set(overlapping.map((r) => r.recipeId))];
  if (recipeIds.length === 0) return [];

  const [matchedRecipes, allIngredients, allSchedules] = await Promise.all([
    db
      .select()
      .from(recipes)
      .where(inArray(recipes.id, recipeIds))
      .orderBy(asc(recipes.name), asc(recipes.createdAt)),
    db
      .select()
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.recipeId, recipeIds))
      .orderBy(asc(recipeIngredients.name), asc(recipeIngredients.id)),
    // Only schedules overlapping the requested window are returned. Their original
    // (unclipped) dates are preserved so the UI can render continuous bars that
    // extend beyond the window boundaries.
    db
      .select()
      .from(recipeSchedules)
      .where(
        and(
          inArray(recipeSchedules.recipeId, recipeIds),
          lte(recipeSchedules.startDate, window.end),
          gte(recipeSchedules.endDate, window.start),
        ),
      )
      .orderBy(
        asc(recipeSchedules.startDate),
        asc(recipeSchedules.endDate),
        asc(recipeSchedules.id),
      ),
  ]);

  const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
  for (const ing of allIngredients) {
    const list = ingredientsByRecipe.get(ing.recipeId) ?? [];
    list.push(ing);
    ingredientsByRecipe.set(ing.recipeId, list);
  }

  const schedulesByRecipe = new Map<string, RecipeSchedule[]>();
  for (const sch of allSchedules) {
    // Return all schedule records for included recipes (original dates preserved),
    // as required by server contract for calendar response.
    const list = schedulesByRecipe.get(sch.recipeId) ?? [];
    list.push(sch);
    schedulesByRecipe.set(sch.recipeId, list);
  }

  return matchedRecipes.map((r) => ({
    ...r,
    ingredients: ingredientsByRecipe.get(r.id) ?? [],
    schedules: schedulesByRecipe.get(r.id) ?? [],
  }));
}
