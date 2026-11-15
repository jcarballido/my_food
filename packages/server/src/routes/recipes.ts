import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { toApiRecipe, toApiSchedule } from "../schemas/api.js";
import {
  recipeBodySchema,
  recipeParamsSchema,
  recipeUpdateSchema,
  recipeWithScheduleBodySchema,
} from "../schemas/requests.js";
import type { RecipeService } from "../services/recipeService.js";
import { authenticateHook } from "../hooks/authenticate.js";

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: {
      code: "bad_request",
      message: "Invalid request",
      details: z.flattenError(error).fieldErrors,
    },
  });
}

export async function recipeRoutes(
  fastify: FastifyInstance,
  service: RecipeService,
): Promise<void> {
  fastify.addHook("preHandler", authenticateHook);

  fastify.get("/api/recipes", async (_request, reply) => {
    const recipes = await service.listRecipes();
    return reply.code(200).send({ recipes: recipes.map(toApiRecipe) });
  });

  fastify.get("/api/recipes/:id", async (request: FastifyRequest, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const recipe = await service.getRecipe(params.data.id);
    return reply.code(200).send({ recipe: toApiRecipe(recipe) });
  });

  fastify.post("/api/recipes", async (request, reply) => {
    const body = recipeBodySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const recipe = await service.createRecipe(body.data, request.authUser!.id);
    return reply.code(201).send({ recipe: toApiRecipe(recipe) });
  });

  /**
   * Composite operation: creates a recipe together with its initial schedule.
   * The server performs it in a single database transaction, so a failure in
   * either part leaves nothing committed.
   */
  fastify.post("/api/recipes/with-schedule", async (request, reply) => {
    const body = recipeWithScheduleBodySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const { recipe, ingredients, schedule } = body.data;
    const result = await service.createRecipeWithSchedule(
      recipe,
      ingredients,
      {
        startDate: schedule.start_date,
        endDate: schedule.end_date,
      },
      request.authUser!.id,
    );

    return reply.code(201).send({
      recipe: toApiRecipe(result.recipe),
      schedule: toApiSchedule(result.schedule),
    });
  });

  fastify.patch("/api/recipes/:id", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const body = recipeUpdateSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const { name, notes, url, icon, ingredients } = body.data;
    const recipe = await service.updateRecipe(params.data.id, {
      name,
      notes,
      url,
      icon,
      updatedBy: request.authUser!.id,
      ingredients: ingredients?.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
      })),
    });

    return reply.code(200).send({ recipe: toApiRecipe(recipe) });
  });

  fastify.delete("/api/recipes/:id", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    await service.deleteRecipe(params.data.id);
    return reply.code(204).send();
  });
}
