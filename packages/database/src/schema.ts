import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Icons a recipe can display in the recipe drawer. */
export const RECIPE_ICONS = ["utensils", "fish", "beef", "egg"] as const;
export type RecipeIcon = (typeof RECIPE_ICONS)[number];

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    notes: text("notes"),
    url: text("url"),
    icon: varchar("icon", { length: 32 }).$type<RecipeIcon>().notNull().default("utensils"),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recipes_name_unique").on(table.name),
    check(
      "recipes_icon_valid",
      sql`${table.icon} in ('utensils', 'fish', 'beef', 'egg')`,
    ),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    quantity: varchar("quantity", { length: 255 }),
  },
  (table) => [
    index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
    foreignKey({
      columns: [table.recipeId],
      foreignColumns: [recipes.id],
      name: "recipe_ingredients_recipe_id_recipes_id_fk",
    }).onDelete("cascade"),
  ],
);

export const recipeSchedules = pgTable(
  "recipe_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recipe_schedules_recipe_id_idx").on(table.recipeId),
    index("recipe_schedules_date_range_idx").on(table.startDate, table.endDate),
    foreignKey({
      columns: [table.recipeId],
      foreignColumns: [recipes.id],
      name: "recipe_schedules_recipe_id_recipes_id_fk",
    }).onDelete("cascade"),
    check(
      "recipe_schedules_end_date_not_before_start_date",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
  schedules: many(recipeSchedules),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeSchedulesRelations = relations(recipeSchedules, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeSchedules.recipeId],
    references: [recipes.id],
  }),
}));

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type RecipeSchedule = typeof recipeSchedules.$inferSelect;
export type NewRecipeSchedule = typeof recipeSchedules.$inferInsert;
