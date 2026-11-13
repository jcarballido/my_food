import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { toApiIngredient } from "../schemas/api.js";
import {
  ingredientBodySchema,
  ingredientParamsSchema,
  ingredientUpdateSchema,
  recipeParamsSchema,
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

export async function ingredientRoutes(
  fastify: FastifyInstance,
  service: RecipeService,
): Promise<void> {
  fastify.addHook("preHandler", authenticateHook);

  fastify.get("/api/recipes/:id/ingredients", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const ingredients = await service.listIngredients(params.data.id);
    return reply.code(200).send({ ingredients: ingredients.map(toApiIngredient) });
  });

  fastify.post("/api/recipes/:id/ingredients", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const body = ingredientBodySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const ingredient = await service.createIngredient(params.data.id, body.data);
    return reply.code(201).send({ ingredient: toApiIngredient(ingredient) });
  });

  fastify.patch("/api/recipes/:id/ingredients/:ingredientId", async (request, reply) => {
    const params = ingredientParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const body = ingredientUpdateSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const ingredient = await service.updateIngredient(params.data.id, params.data.ingredientId, {
      name: body.data.name,
      quantity: body.data.quantity,
    });
    return reply.code(200).send({ ingredient: toApiIngredient(ingredient) });
  });

  fastify.delete("/api/recipes/:id/ingredients/:ingredientId", async (request, reply) => {
    const params = ingredientParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    await service.deleteIngredient(params.data.id, params.data.ingredientId);
    return reply.code(204).send();
  });
}
