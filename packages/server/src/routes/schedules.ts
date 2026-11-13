import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { toApiSchedule } from "../schemas/api.js";
import {
  recipeParamsSchema,
  scheduleBodySchema,
  scheduleParamsSchema,
  scheduleUpdateSchema,
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

export async function scheduleRoutes(
  fastify: FastifyInstance,
  service: RecipeService,
): Promise<void> {
  fastify.addHook("preHandler", authenticateHook);

  fastify.get("/api/recipes/:id/schedules", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const schedules = await service.listSchedules(params.data.id);
    return reply.code(200).send({ schedules: schedules.map(toApiSchedule) });
  });

  fastify.post("/api/recipes/:id/schedules", async (request, reply) => {
    const params = recipeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const body = scheduleBodySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const schedule = await service.createSchedule(params.data.id, {
      startDate: body.data.start_date,
      endDate: body.data.end_date,
    });
    return reply.code(201).send({ schedule: toApiSchedule(schedule) });
  });

  fastify.patch("/api/recipes/:id/schedules/:scheduleId", async (request, reply) => {
    const params = scheduleParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    const body = scheduleUpdateSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error);

    const schedule = await service.updateSchedule(params.data.id, params.data.scheduleId, {
      startDate: body.data.start_date,
      endDate: body.data.end_date,
    });
    return reply.code(200).send({ schedule: toApiSchedule(schedule) });
  });

  fastify.delete("/api/recipes/:id/schedules/:scheduleId", async (request, reply) => {
    const params = scheduleParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error);

    await service.deleteSchedule(params.data.id, params.data.scheduleId);
    return reply.code(204).send();
  });
}
