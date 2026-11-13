import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toApiCalendarRecipe } from "../schemas/api.js";
import { calendarQuerySchema } from "../schemas/requests.js";
import type { CalendarService } from "../services/calendarService.js";
import { authenticateHook } from "../hooks/authenticate.js";

export async function calendarRoutes(
  fastify: FastifyInstance,
  service: CalendarService,
): Promise<void> {
  fastify.addHook("preHandler", authenticateHook);

  /**
   * Retrieves recipes scheduled within a calendar month.
   *
   * `month` and `year` are required. The window spans the first through the
   * last calendar day of the requested month; schedules are returned with
   * their original (unclipped) date ranges.
   */
  fastify.get("/api/calendar", async (request, reply) => {
    const query = calendarQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        error: {
          code: "bad_request",
          message: "month and year are required and must describe a valid calendar month",
          details: z.flattenError(query.error).fieldErrors,
        },
      });
    }

    const recipes = await service.getMonthRecipes(query.data.month, query.data.year);
    return reply.code(200).send({ recipes: recipes.map(toApiCalendarRecipe) });
  });
}
