import { z } from "zod";

/** UUID as emitted by PostgreSQL's `gen_random_uuid()`. */
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "must be a valid UUID",
  );

/** Calendar date in ISO `YYYY-MM-DD` form. */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a valid ISO date (YYYY-MM-DD)")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "must be a valid calendar date");

/**
 * Optional free-form URL. An empty string is normalised to `null`.
 *
 * `preprocess` is used rather than `transform` on purpose: a transform also
 * runs for keys that are absent from the payload, which would turn "not
 * supplied" into `null` and silently clear the stored value on a partial
 * update. With `preprocess`, absent keys stay absent.
 */
export const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.url("must be a valid URL").refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "URL must use http or https",
  ).nullish(),
);

/** Optional free-form text. An empty string is normalised to `null`. */
export const optionalTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(10_000).nullish(),
);

/** Ingredient quantity: free-form text such as `1/2 cup`, `1 tbsp`, `to taste`. */
export const quantitySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(255).nullish(),
);

export const recipeNameSchema = z.string().trim().min(1, "name is required").max(255);

/** Recipe drawer icon. Defaults to `utensils` when omitted on creation. */
export const recipeIconSchema = z.enum(["utensils", "fish", "beef", "egg"]);

/** Optional cook assigned to a schedule. */
export const scheduleCookSchema = z.enum(["J", "H"]);
