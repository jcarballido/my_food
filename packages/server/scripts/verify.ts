/**
 * End-to-end verification of the server against a real PostgreSQL database.
 *
 * Run with:
 *   DATABASE_URL=postgresql://... pnpm --filter @my_food/server verify
 *
 * The suite boots the real Fastify application in-process and exercises the
 * public HTTP surface using `inject`, so routing, validation, authentication,
 * persistence and the calendar window logic are all covered.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { loadEnv, type Env } from "../src/config/env.js";
import { toIsoTimestamp } from "../src/utils/timestamps.js";
import { createRecipeWithSchedule, deleteRecipe, listRecipes } from "@my_food/database";
import { getMonthWindow } from "../src/utils/calendar.js";

const JWT_SECRET = "test-jwt-secret-value-for-integration-tests";

/**
 * Builds a token the server accepts.
 *
 * The server verifies with HS256 when `SUPABASE_JWT_SECRET` is configured, and
 * requires the `authenticated` role, so the fixture mirrors a Supabase access
 * token closely enough to exercise the real verification path.
 */
async function createAccessToken(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("https://example.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

function buildTestEnv(): Env {
  return loadEnv({
    PORT: "3001",
    HOST: "127.0.0.1",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_JWT_SECRET: JWT_SECRET,
    SUPABASE_ANON_KEY: "test-anon-key",
    ALLOWED_EMAILS: "Allowed.User@example.com, second@example.com",
    AUTH_CALLBACK_URL: "http://localhost:5173/auth/callback",
    CORS_ORIGIN: "http://localhost:5173",
    APP_TIMEZONE: "UTC",
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
  });
}

interface TestContext {
  app: Awaited<ReturnType<typeof buildApp>>;
  token: string;
  userId: string;
  email: string;
}

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: (ctx: TestContext) => void | Promise<void>): Promise<void> {
  const ctx = globalThis.__ctx as TestContext;
  try {
    await fn(ctx);
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
    console.log(`FAIL  ${name}\n      ${(error as Error).message}`);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __ctx: TestContext;
}

async function main(): Promise<void> {
  const env = buildTestEnv();
  const app = await buildApp(env);

  const userId = randomUUID();
  const email = "allowed.user@example.com";
  const token = await createAccessToken(userId, email);

  globalThis.__ctx = { app, token, userId, email };

  const auth = { authorization: `Bearer ${token}` };
  const unique = Date.now().toString(36);

  try {
  console.log("\nHealth & auth");

  await test("GET /health returns ok", async ({ app: instance }) => {
    const response = await instance.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
  });

  await test("unknown route returns 404 with error envelope", async ({ app: instance }) => {
    const response = await instance.inject({ method: "GET", url: "/api/nope" });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "not_found");
  });

  await test("protected route rejects missing token", async ({ app: instance }) => {
    const response = await instance.inject({ method: "GET", url: "/api/recipes" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "unauthorized");
  });

  await test("protected route rejects malformed token", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "GET",
      url: "/api/recipes",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    assert.equal(response.statusCode, 401);
  });

  await test("signed tokens require valid issuer, audience, expiry, identity and role", async () => {
    const valid = {
      sub: userId, email, role: "authenticated",
      iss: "https://example.supabase.co/auth/v1",
      aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const invalid = [
      { ...valid, aud: "other-api" },
      { ...valid, iss: "https://other.supabase.co/auth/v1" },
      { ...valid, iss: undefined },
      { ...valid, exp: undefined },
      { ...valid, exp: 1 },
      { ...valid, role: "service_role" },
      { ...valid, role: undefined },
      { ...valid, sub: "not-a-uuid" },
    ];
    for (const claims of invalid) {
      const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(JWT_SECRET));
      const response = await app.inject({
        method: "GET", url: "/api/recipes", headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 401, JSON.stringify(claims));
    }
    const forged = await new SignJWT(valid).setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("different-signing-secret"));
    assert.equal((await app.inject({
      method: "GET", url: "/api/recipes", headers: { authorization: `Bearer ${forged}` },
    })).statusCode, 401);
  });

  await test("invalid callback, origin and missing allowlist fail closed", () => {
    const config = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
    assert.throws(() => loadEnv({ ...config, AUTH_CALLBACK_URL: "javascript:alert(1)" }));
    assert.throws(() => loadEnv({ ...config, CORS_ORIGIN: "*" }));
    assert.throws(() => loadEnv({ ...config, ALLOWED_EMAILS: "" }));
  });

  await test("normalized allowlisted email uses the configured provider callback", async () => {
    const original = app.supabase.auth.signInWithOtp;
    let called = false;
    app.supabase.auth.signInWithOtp = async (credentials) => {
      assert.ok("email" in credentials);
      assert.equal(credentials.email, email);
      assert.equal(credentials.options?.emailRedirectTo, env.AUTH_CALLBACK_URL);
      called = true;
      return { data: { user: null, session: null }, error: null };
    };
    try {
      const response = await app.inject({
        method: "POST", url: "/api/auth/magic-link",
        payload: { email: "  ALLOWED.USER@EXAMPLE.COM  " },
      });
      assert.equal(response.statusCode, 200);
      assert.ok(called);
    } finally {
      app.supabase.auth.signInWithOtp = original;
    }
  });

  await test("magic-link rejects malformed email", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/auth/magic-link",
      payload: { email: "not-an-email" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "bad_request");
  });

  await test("magic-link rejects email outside allowlist", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/auth/magic-link",
      payload: { email: "intruder@example.com" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "forbidden");
    assert.ok(!JSON.stringify(response.json()).includes("Allowed.User"));
  });

  console.log("\nRecipe CRUD");

  await test("POST /api/recipes creates recipe with snake_case payload", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Pancakes ${unique}`, notes: "Sunday brunch", url: "https://example.com/p" },
    });
    assert.equal(response.statusCode, 201);
    const { recipe } = response.json();
    assert.equal(recipe.name, `Pancakes ${unique}`);
    assert.equal(recipe.created_by, userId);
    assert.equal(recipe.updated_by, userId);
    assert.deepEqual(recipe.ingredients, []);
    assert.ok(typeof recipe.created_at === "string");
    assert.ok(!("createdBy" in recipe));
    assert.ok(!("ingredients" in recipe === false));
  });

  await test("GET /api/recipes lists recipes with ingredients", async ({ app: instance }) => {
    const response = await instance.inject({ method: "GET", url: "/api/recipes", headers: auth });
    assert.equal(response.statusCode, 200);
    const { recipes } = response.json();
    assert.ok(Array.isArray(recipes));
    assert.ok(recipes.length > 0);
    const withIngredients = recipes.find((r: any) => Array.isArray(r.ingredients));
    assert.ok(withIngredients, "recipes should expose an ingredients array");
  });

  await test("POST /api/recipes rejects duplicate name with 409", async ({ app: instance }) => {
    const name = `Duplicate ${unique}`;
    const first = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name },
    });
    assert.equal(first.statusCode, 201);

    const second = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name },
    });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.code, "conflict");
  });

  await test("POST /api/recipes rejects empty name", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: "   " },
    });
    assert.equal(response.statusCode, 400);
  });

  await test("GET /api/recipes/:id rejects malformed id", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "GET",
      url: "/api/recipes/not-a-uuid",
      headers: auth,
    });
    assert.equal(response.statusCode, 400);
  });

  await test("GET /api/recipes/:id returns 404 for unknown recipe", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "GET",
      url: "/api/recipes/11111111-1111-4111-8111-111111111111",
      headers: auth,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "not_found");
  });

  console.log("\nIngredients");

  await test("ingredient lifecycle: create, list, update, delete", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Ingredients ${unique}` },
    });
    const recipeId = created.json().recipe.id;

    const add = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/ingredients`,
      headers: auth,
      payload: { name: "Flour", quantity: "1/2 cup" },
    });
    assert.equal(add.statusCode, 201);
    const ingredient = add.json().ingredient;
    assert.equal(ingredient.recipe_id, recipeId);
    assert.equal(ingredient.quantity, "1/2 cup");

    const list = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}/ingredients`,
      headers: auth,
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().ingredients.length, 1);

    const update = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}/ingredients/${ingredient.id}`,
      headers: auth,
      payload: { quantity: "1 cup" },
    });
    assert.equal(update.statusCode, 200);
    assert.equal(update.json().ingredient.quantity, "1 cup");

    const remove = await instance.inject({
      method: "DELETE",
      url: `/api/recipes/${recipeId}/ingredients/${ingredient.id}`,
      headers: auth,
    });
    assert.equal(remove.statusCode, 204);
  });

  await test("ingredient of another recipe returns 404", async ({ app: instance }) => {
    const a = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Owner A ${unique}` },
    });
    const b = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Owner B ${unique}` },
    });
    const recipeA = a.json().recipe.id;
    const recipeB = b.json().recipe.id;

    const ingredient = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeA}/ingredients`,
      headers: auth,
      payload: { name: "Sugar" },
    });
    const ingredientId = ingredient.json().ingredient.id;

    const crossUpdate = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeB}/ingredients/${ingredientId}`,
      headers: auth,
      payload: { name: "Nope" },
    });
    assert.equal(crossUpdate.statusCode, 404);
  });

  console.log("\nSchedules");

  await test("schedule lifecycle honours date range rules", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Schedules ${unique}` },
    });
    const recipeId = created.json().recipe.id;

    const invalid = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
      payload: { start_date: "2026-11-10", end_date: "2026-11-01" },
    });
    assert.equal(invalid.statusCode, 400);

    const invalidDate = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
      payload: { start_date: "2026-02-30", end_date: "2026-03-01" },
    });
    assert.equal(invalidDate.statusCode, 400);

    const ok = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
      payload: { start_date: "2026-11-10", end_date: "2026-11-13" },
    });
    assert.equal(ok.statusCode, 201);
    const schedule = ok.json().schedule;
    assert.equal(schedule.start_date, "2026-11-10");
    assert.equal(schedule.end_date, "2026-11-13");
    assert.equal(schedule.recipe_id, recipeId);

    const list = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
    });
    assert.equal(list.json().schedules.length, 1);

    const remove = await instance.inject({
      method: "DELETE",
      url: `/api/recipes/${recipeId}/schedules/${schedule.id}`,
      headers: auth,
    });
    assert.equal(remove.statusCode, 204);
  });

  console.log("\nComposite create-with-schedule");

  await test("POST /api/recipes/with-schedule creates recipe, ingredients and schedule", async ({
    app: instance,
  }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Composite ${unique}`, notes: null, url: null },
        ingredients: [
          { name: "Flour", quantity: "1/2 cup" },
          { name: "Milk", quantity: null },
        ],
        schedule: { start_date: "2026-11-10", end_date: "2026-11-13" },
      },
    });

    assert.equal(response.statusCode, 201);
    const { recipe, schedule } = response.json();
    assert.equal(recipe.name, `Composite ${unique}`);
    assert.equal(recipe.ingredients.length, 2);
    assert.equal(schedule.start_date, "2026-11-10");
    assert.equal(schedule.recipe_id, recipe.id);

    const persisted = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipe.id}/schedules`,
      headers: auth,
    });
    assert.equal(persisted.json().schedules.length, 1);
  });

  await test("composite operation rolls back when the schedule is invalid", async ({
    app: instance,
  }) => {
    const name = `Rollback ${unique}`;
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name },
        ingredients: [],
        schedule: { start_date: "2026-11-13", end_date: "2026-11-10" },
      },
    });

    assert.equal(response.statusCode, 400);

    // The recipe must not have been persisted.
    const list = await instance.inject({ method: "GET", url: "/api/recipes", headers: auth });
    const found = list.json().recipes.find((r: any) => r.name === name);
    assert.equal(found, undefined, "recipe should not be persisted after rollback");
  });

  await test("composite operation rolls back on duplicate name", async ({ app: instance }) => {
    const name = `Duplicate composite ${unique}`;
    const first = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name },
        ingredients: [{ name: "Egg" }],
        schedule: { start_date: "2026-11-10", end_date: "2026-11-11" },
      },
    });
    assert.equal(first.statusCode, 201);

    const second = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name },
        ingredients: [{ name: "Egg" }],
        schedule: { start_date: "2026-11-12", end_date: "2026-11-13" },
      },
    });
    assert.equal(second.statusCode, 409);

    // The schedule from the failed attempt must not exist.
    const recipeId = first.json().recipe.id;
    const schedules = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
    });
    assert.equal(schedules.json().schedules.length, 1);
  });

  console.log("\nRecipe update with ingredients");

  await test("PATCH /api/recipes/:id replaces ingredients atomically", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Patched ${unique}` },
        ingredients: [{ name: "Old", quantity: "1" }],
        schedule: { start_date: "2026-11-10", end_date: "2026-11-11" },
      },
    });
    const recipeId = created.json().recipe.id;

    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
      payload: {
        name: `Patched renamed ${unique}`,
        ingredients: [
          { name: "New A", quantity: "2" },
          { name: "New B", quantity: null },
        ],
      },
    });

    assert.equal(patched.statusCode, 200);
    const recipe = patched.json().recipe;
    assert.equal(recipe.name, `Patched renamed ${unique}`);
    assert.equal(recipe.ingredients.length, 2);
    assert.ok(recipe.ingredients.every((i: any) => i.name !== "Old"));
  });

  await test("PATCH without ingredients leaves ingredients untouched", async ({
    app: instance,
  }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Untouched ${unique}` },
        ingredients: [{ name: "Keep", quantity: "3" }],
        schedule: { start_date: "2026-11-10", end_date: "2026-11-11" },
      },
    });
    const recipeId = created.json().recipe.id;

    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
      payload: { notes: "Only notes changed" },
    });

    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().recipe.ingredients.length, 1);
    assert.equal(patched.json().recipe.ingredients[0].name, "Keep");
  });

  await test("updated_by changes while created_by is preserved", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Audit ${unique}` },
    });
    const recipe = created.json().recipe;

    const otherUserId = randomUUID();
    const otherToken = await createAccessToken(otherUserId, "second@example.com");

    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipe.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { notes: "Edited by someone else" },
    });

    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().recipe.created_by, recipe.created_by);
    assert.equal(patched.json().recipe.updated_by, otherUserId);
  });

  await test("client cannot set audit fields", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: {
        name: `Spoof ${unique}`,
        created_by: "99999999-9999-4999-8999-999999999999",
        updated_by: "99999999-9999-4999-8999-999999999999",
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().recipe.created_by, userId);
    assert.equal(response.json().recipe.updated_by, userId);
  });

  console.log("\nCalendar");

  await test("calendar requires month and year", async ({ app: instance }) => {
    const response = await instance.inject({ method: "GET", url: "/api/calendar", headers: auth });
    assert.equal(response.statusCode, 400);
  });

  await test("calendar rejects invalid month", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "GET",
      url: "/api/calendar?month=13&year=2026",
      headers: auth,
    });
    assert.equal(response.statusCode, 400);
  });

  await test("calendar returns only overlapping recipes, once each", async ({ app: instance }) => {
    // Recipe inside November only.
    await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Cal inside ${unique}` },
        schedule: { start_date: "2026-11-01", end_date: "2026-11-30" },
      },
    });
    // Recipe crossing into November from October.
    await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Cal crossing ${unique}` },
        schedule: { start_date: "2026-10-28", end_date: "2026-11-05" },
      },
    });
    // Recipe entirely outside November.
    await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Cal outside ${unique}` },
        schedule: { start_date: "2026-12-01", end_date: "2026-12-10" },
      },
    });
    // Recipe with two November schedules — must appear once.
    await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Cal twice ${unique}` },
        schedule: { start_date: "2026-11-10", end_date: "2026-11-12" },
      },
    });
    const twiceId = (
      await instance.inject({ method: "GET", url: "/api/recipes", headers: auth })
    ).json().recipes.find((r: any) => r.name === `Cal twice ${unique}`).id;
    await instance.inject({
      method: "POST",
      url: `/api/recipes/${twiceId}/schedules`,
      headers: auth,
      payload: { start_date: "2026-11-20", end_date: "2026-11-22" },
    });

    const response = await instance.inject({
      method: "GET",
      url: "/api/calendar?month=11&year=2026",
      headers: auth,
    });
    assert.equal(response.statusCode, 200);
    const { recipes } = response.json();

    const names = recipes.map((r: any) => r.name);
    assert.ok(names.includes(`Cal inside ${unique}`));
    assert.ok(names.includes(`Cal crossing ${unique}`));
    assert.ok(!names.includes(`Cal outside ${unique}`));

    const twice = recipes.filter((r: any) => r.name === `Cal twice ${unique}`);
    assert.equal(twice.length, 1, "recipe must appear exactly once");
    assert.equal(twice[0].schedules.length, 2, "all overlapping schedules must be returned");

    // Dates must be unclipped.
    const crossing = recipes.find((r: any) => r.name === `Cal crossing ${unique}`);
    assert.equal(crossing.schedules[0].start_date, "2026-10-28");
    assert.equal(crossing.schedules[0].end_date, "2026-11-05");

    // Recipes expose ingredients.
    assert.ok(Array.isArray(crossing.ingredients));
  });

  await test("calendar excludes recipes with no overlapping schedule", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `No schedule ${unique}` },
    });
    const recipeId = created.json().recipe.id;

    const response = await instance.inject({
      method: "GET",
      url: "/api/calendar?month=11&year=2026",
      headers: auth,
    });
    assert.ok(
      !response.json().recipes.some((r: any) => r.id === recipeId),
      "recipe without schedules must not appear",
    );
  });

  await test("calendar month window is calendar-based, not rolling", async ({ app: instance }) => {
    const name = `Window ${unique}`;
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name },
        schedule: { start_date: "2026-11-30", end_date: "2026-12-01" },
      },
    });
    const recipeId = created.json().recipe.id;

    const november = await instance.inject({
      method: "GET",
      url: "/api/calendar?month=11&year=2026",
      headers: auth,
    });
    assert.ok(november.json().recipes.some((r: any) => r.id === recipeId));

    const october = await instance.inject({
      method: "GET",
      url: "/api/calendar?month=10&year=2026",
      headers: auth,
    });
    assert.ok(
      !october.json().recipes.some((r: any) => r.id === recipeId),
      "a schedule starting on Nov 30 must not appear in October",
    );
  });

  console.log("\nPartial updates");

  await test("database transaction rolls back recipe and ingredients on schedule constraint failure", async () => {
    const name = `Constraint rollback ${unique}`;
    await assert.rejects(createRecipeWithSchedule(app.db, {
      recipe: { name, createdBy: userId },
      ingredients: [{ name: "Must roll back" }],
      schedule: { startDate: "2026-11-13", endDate: "2026-11-10" },
    }));
    assert.ok(!(await listRecipes(app.db)).some((recipe) => recipe.name === name));
  });

  await test("calendar leap years use Gregorian rules including years below 100", async () => {
    assert.equal(getMonthWindow(2, 4, "UTC").end, "0004-02-29");
    assert.equal(getMonthWindow(2, 100, "UTC").end, "0100-02-28");
    assert.equal(getMonthWindow(2, 2000, "UTC").end, "2000-02-29");
    const response = await app.inject({
      method: "POST", url: "/api/recipes/with-schedule", headers: auth,
      payload: {
        recipe: { name: `Early leap ${unique}` },
        schedule: { start_date: "0004-02-29", end_date: "0004-02-29" },
      },
    });
    assert.equal(response.statusCode, 201);
  });

  await test("PATCH /api/recipes/:id keeps omitted fields intact", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: {
        name: `Partial ${unique}`,
        notes: "Keep these notes",
        url: "https://example.com/keep",
      },
    });
    assert.equal(created.statusCode, 201);
    const recipeId = created.json().recipe.id;

    // Only the name is supplied; notes and url must survive.
    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
      payload: { name: `Partial renamed ${unique}` },
    });

    assert.equal(patched.statusCode, 200);
    const recipe = patched.json().recipe;
    assert.equal(recipe.name, `Partial renamed ${unique}`);
    assert.equal(recipe.notes, "Keep these notes");
    assert.equal(recipe.url, "https://example.com/keep");
  });

  await test("PATCH /api/recipes/:id rejects an empty body", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Empty body ${unique}`, notes: "unchanged" },
    });
    const recipeId = created.json().recipe.id;

    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
      payload: {},
    });

    assert.equal(patched.statusCode, 400);
    assert.equal(patched.json().error.code, "bad_request");

    // The recipe must be unchanged.
    const recipe = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
    });
    assert.equal(recipe.json().recipe.notes, "unchanged");
  });

  await test("PATCH ingredient keeps an omitted quantity intact", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Partial ingredient ${unique}` },
    });
    const recipeId = created.json().recipe.id;

    const ingredient = await instance.inject({
      method: "POST",
      url: `/api/recipes/${recipeId}/ingredients`,
      headers: auth,
      payload: { name: "Flour", quantity: "1/2 cup" },
    });
    const ingredientId = ingredient.json().ingredient.id;

    // Renaming must not erase the quantity.
    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}/ingredients/${ingredientId}`,
      headers: auth,
      payload: { name: "Plain flour" },
    });

    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().ingredient.name, "Plain flour");
    assert.equal(patched.json().ingredient.quantity, "1/2 cup");

    const empty = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}/ingredients/${ingredientId}`,
      headers: auth,
      payload: {},
    });
    assert.equal(empty.statusCode, 400);
  });

  await test("an explicitly empty notes value clears the field", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Clearable ${unique}`, notes: "remove me" },
    });
    const recipeId = created.json().recipe.id;

    const patched = await instance.inject({
      method: "PATCH",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
      payload: { notes: "" },
    });

    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().recipe.notes, null);
  });

  console.log("\nTimestamp normalisation");

  await test("PostgreSQL timestamps become ISO-8601 UTC", () => {
    assert.equal(
      toIsoTimestamp("2026-11-13 10:01:07.564996-06"),
      "2026-11-13T16:01:07.564Z",
    );
    assert.equal(
      toIsoTimestamp("2026-11-13 10:01:07.564996+00"),
      "2026-11-13T10:01:07.564Z",
    );
    assert.equal(
      toIsoTimestamp("2026-11-13 10:01:07+02"),
      "2026-11-13T08:01:07.000Z",
    );
  });

  await test("already-ISO timestamps are preserved and normalised to UTC", () => {
    assert.equal(toIsoTimestamp("2026-11-13T16:01:07.564Z"), "2026-11-13T16:01:07.564Z");
    assert.equal(
      toIsoTimestamp("2026-11-13T18:01:07.564+02:00"),
      "2026-11-13T16:01:07.564Z",
    );
    assert.equal(toIsoTimestamp(new Date("2026-11-13T16:01:07.564Z")), "2026-11-13T16:01:07.564Z");
  });

  await test("API responses expose ISO-8601 timestamps", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "POST",
      url: "/api/recipes",
      headers: auth,
      payload: { name: `Timestamps ${unique}` },
    });
    assert.equal(response.statusCode, 201);
    const { recipe } = response.json();

    assert.match(recipe.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(recipe.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!recipe.created_at.includes(" "));
  });

  console.log("\nDeletion & cascade");

  await test("deleting a recipe removes its ingredients and schedules", async ({ app: instance }) => {
    const created = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Cascade ${unique}` },
        ingredients: [{ name: "Flour" }],
        schedule: { start_date: "2026-11-10", end_date: "2026-11-11" },
      },
    });
    const recipeId = created.json().recipe.id;

    const deleted = await instance.inject({
      method: "DELETE",
      url: `/api/recipes/${recipeId}`,
      headers: auth,
    });
    assert.equal(deleted.statusCode, 204);

    const ingredients = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}/ingredients`,
      headers: auth,
    });
    assert.equal(ingredients.statusCode, 404);

    const schedules = await instance.inject({
      method: "GET",
      url: `/api/recipes/${recipeId}/schedules`,
      headers: auth,
    });
    assert.equal(schedules.statusCode, 404);
  });

  await test("deleting a recipe does not delete its schedules independently", async ({
    app: instance,
  }) => {
    // Deleting one recipe must leave other recipes' schedules intact.
    const a = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Keeper A ${unique}` },
        schedule: { start_date: "2026-11-10", end_date: "2026-11-11" },
      },
    });
    const b = await instance.inject({
      method: "POST",
      url: "/api/recipes/with-schedule",
      headers: auth,
      payload: {
        recipe: { name: `Keeper B ${unique}` },
        schedule: { start_date: "2026-11-12", end_date: "2026-11-13" },
      },
    });

    await instance.inject({
      method: "DELETE",
      url: `/api/recipes/${a.json().recipe.id}`,
      headers: auth,
    });

    const schedules = await instance.inject({
      method: "GET",
      url: `/api/recipes/${b.json().recipe.id}/schedules`,
      headers: auth,
    });
    assert.equal(schedules.json().schedules.length, 1);
  });

  await test("DELETE unknown recipe returns 404", async ({ app: instance }) => {
    const response = await instance.inject({
      method: "DELETE",
      url: "/api/recipes/11111111-1111-4111-8111-111111111111",
      headers: auth,
    });
    assert.equal(response.statusCode, 404);
  });

  } finally {
    try {
      // Only remove records created with this run's unique user identity.
      for (const recipe of await listRecipes(app.db)) {
        if (recipe.createdBy === userId) await deleteRecipe(app.db, recipe.id);
      }
    } finally {
      await app.close();
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
