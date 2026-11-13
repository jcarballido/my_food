import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { loadEnv, type Env } from "./config/env.js";
import authPlugin from "./plugins/auth.js";
import databasePlugin from "./plugins/database.js";
import { authRoutes } from "./routes/auth.js";
import { calendarRoutes } from "./routes/calendar.js";
import { ingredientRoutes } from "./routes/ingredients.js";
import { recipeRoutes } from "./routes/recipes.js";
import { scheduleRoutes } from "./routes/schedules.js";
import { CalendarService } from "./services/calendarService.js";
import { RecipeService } from "./services/recipeService.js";
import { errorHandler } from "./utils/http.js";

/**
 * Builds the Fastify application.
 *
 * Kept separate from the process bootstrap so the server can be exercised
 * in-process (for example with `inject`) without binding a port.
 */
export async function buildApp(env: Env = loadEnv()): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: { level: env.logLevel },
  });

  fastify.decorate("env", env);
  fastify.setErrorHandler(errorHandler);

  await fastify.register(sensible);
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Same-origin/non-browser requests have no Origin header.
      if (!origin) return callback(null, true);
      callback(null, env.corsOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await fastify.register(databasePlugin);
  await fastify.register(authPlugin);

  const recipeService = new RecipeService(fastify.db);
  const calendarService = new CalendarService(fastify.db, env.APP_TIMEZONE);

  await fastify.register(authRoutes);
  await fastify.register(recipeRoutes, recipeService);
  await fastify.register(ingredientRoutes, recipeService);
  await fastify.register(scheduleRoutes, recipeService);
  await fastify.register(calendarRoutes, calendarService);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: { code: "not_found", message: `Route ${request.method} ${request.url} not found` },
    });
  });

  return fastify;
}
