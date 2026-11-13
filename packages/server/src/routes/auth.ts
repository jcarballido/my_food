import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { isEmailAllowed } from "../config/env.js";
import { magicLinkBodySchema } from "../schemas/requests.js";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Initiates a magic-link sign-in.
   *
   * This endpoint is intentionally *not* session-protected: it starts the
   * authentication flow. Authorization is enforced by the server-side
   * allowlist, which is checked before any provider call is made so that
   * unauthorized addresses cannot trigger an email.
   */
  fastify.post("/api/auth/magic-link", async (request, reply: FastifyReply) => {
    const parsed = magicLinkBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "bad_request",
          message: "Invalid request body",
          details: z.flattenError(parsed.error).fieldErrors,
        },
      });
    }

    const email = parsed.data.email;

    if (!isEmailAllowed(fastify.env, email)) {
      // The allowlist is never disclosed; a non-allowlisted address simply
      // cannot start an authentication flow.
      return reply.code(403).send({
        error: { code: "forbidden", message: "This email address is not authorized" },
      });
    }


    const { error } = await fastify.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: fastify.env.AUTH_CALLBACK_URL,
        shouldCreateUser: true,
      },
    });

    if (error) {
      request.log.warn({ err: error, email }, "Failed to initiate magic link");
      return reply.code(400).send({
        error: { code: "bad_request", message: "Unable to initiate authentication" },
      });
    }

    return reply.code(200).send({ ok: true });
  });
}
