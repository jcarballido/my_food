import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Authentication hook for protected routes.
 *
 * Validates the bearer token and attaches the verified identity to the
 * request. The identity is always derived from the verified token — never
 * from anything the client supplied.
 */
export async function authenticateHook(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header) {
    throw request.server.httpErrors.unauthorized("Missing authorization header");
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    throw request.server.httpErrors.unauthorized(
      "Authorization header must use the Bearer scheme",
    );
  }

  request.authUser = await request.server.verifyAccessToken(match[1]);
}
