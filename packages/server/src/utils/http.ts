import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Maps a database error to a client-safe HTTP status.
 *
 * Drizzle wraps driver errors in `DrizzleQueryError`, so the underlying
 * PostgreSQL error (which carries the SQLSTATE code) is unwrapped first.
 */
export function mapDatabaseError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} | null {
  const dbError = unwrapDatabaseError(error);
  if (!dbError) return null;

  switch (dbError.code) {
    case "23505": {
      // unique_violation
      if (dbError.constraint === "recipes_name_unique") {
        return {
          statusCode: 409,
          code: "conflict",
          message: "A recipe with this name already exists",
        };
      }
      return { statusCode: 409, code: "conflict", message: "Resource conflict" };
    }
    case "23503":
      // foreign_key_violation
      return {
        statusCode: 400,
        code: "bad_request",
        message: "Referenced resource does not exist",
      };
    case "23514":
      // check_violation
      return {
        statusCode: 400,
        code: "bad_request",
        message: "Request violates a data constraint",
      };
    case "22P02":
      // invalid_text_representation
      return { statusCode: 400, code: "bad_request", message: "Malformed identifier" };
    default:
      return null;
  }
}

interface DriverError {
  code?: string;
  constraint?: string;
  message?: string;
}

/**
 * Unwraps `DrizzleQueryError` to reach the original driver error.
 * The wrapper exposes the original as `cause`.
 */
function unwrapDatabaseError(error: unknown): DriverError | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as DriverError & { cause?: unknown };

  if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
    return candidate;
  }

  if (candidate.cause && typeof candidate.cause === "object") {
    const cause = candidate.cause as DriverError;
    if (typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code)) {
      return cause;
    }
  }

  return null;
}

/**
 * Central error handler.
 *
 * Every failure leaves the API with the same error envelope, and internal
 * details (SQL, stack traces, credentials) are never exposed to clients.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const statusCode = error.statusCode ?? 500;

  // Database errors are checked first: Drizzle's wrapper carries no status
  // code, so it would otherwise be reported as an internal error.
  const mapped = mapDatabaseError(error);
  if (mapped) {
    request.log.info({ err: error }, "Database constraint violated");
    return reply.code(mapped.statusCode).send({
      error: { code: mapped.code, message: mapped.message },
    });
  }

  if (statusCode >= 400 && statusCode < 500) {
    const code = codeForStatus(statusCode);
    const body: ApiErrorBody = {
      error: { code, message: publicMessage(error, statusCode) },
    };

    const validation = (error as FastifyError & { validation?: unknown }).validation;
    if (validation) body.error.details = validation;

    request.log.info({ err: error, statusCode }, "Request rejected");
    return reply.code(statusCode).send(body);
  }

  request.log.error({ err: error }, "Unhandled server error");
  return reply.code(500).send({
    error: { code: "internal_error", message: "Internal server error" },
  });
}

function codeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 429:
      return "too_many_requests";
    default:
      return "invalid_request";
  }
}

function publicMessage(error: FastifyError, statusCode: number): string {
  // Fastify only assigns a 4xx status to errors that were raised deliberately,
  // so the message is safe to expose.
  if (error.message) return error.message;
  if (statusCode === 404) return "Resource not found";
  return "Invalid request";
}
