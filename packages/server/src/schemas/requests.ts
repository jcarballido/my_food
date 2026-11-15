import { z } from "zod";
import {
  isoDateSchema,
  optionalTextSchema,
  optionalUrlSchema,
  quantitySchema,
  recipeIconSchema,
  recipeNameSchema,
  uuidSchema,
} from "./common.js";

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1, "ingredient name is required").max(255),
  quantity: quantitySchema,
});

export const recipeBodySchema = z.object({
  name: recipeNameSchema,
  notes: optionalTextSchema,
  url: optionalUrlSchema,
  icon: recipeIconSchema.optional(),
});

export const recipeUpdateSchema = z
  .object({
    name: recipeNameSchema.optional(),
    notes: optionalTextSchema,
    url: optionalUrlSchema,
    icon: recipeIconSchema.optional(),
    ingredients: z.array(ingredientInputSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const ingredientUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    quantity: quantitySchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const scheduleInputSchema = z
  .object({
    start_date: isoDateSchema,
    end_date: isoDateSchema,
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: "end_date cannot precede start_date",
    path: ["end_date"],
  });

export const scheduleUpdateSchema = z
  .object({
    start_date: isoDateSchema.optional(),
    end_date: isoDateSchema.optional(),
  })
  .refine((value) => value.start_date !== undefined || value.end_date !== undefined, {
    message: "at least one field must be provided",
  });

/** Body accepted by `POST /api/recipes/:id/schedules`. */
export const scheduleBodySchema = scheduleInputSchema;

/** Body accepted by `POST /api/recipes/:id/ingredients`. */
export const ingredientBodySchema = ingredientInputSchema;

export const recipeWithScheduleBodySchema = z.object({
  recipe: recipeBodySchema,
  ingredients: z.array(ingredientInputSchema).optional().default([]),
  schedule: scheduleInputSchema,
});

export const magicLinkBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "must be a valid email address" })),
});

export const recipeParamsSchema = z.object({
  id: uuidSchema,
});

export const ingredientParamsSchema = z.object({
  id: uuidSchema,
  ingredientId: uuidSchema,
});

export const scheduleParamsSchema = z.object({
  id: uuidSchema,
  scheduleId: uuidSchema,
});

export const calendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1).max(9999),
});
