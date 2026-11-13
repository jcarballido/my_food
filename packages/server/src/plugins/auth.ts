import fp from "fastify-plugin";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import type { Env } from "../config/env.js";
import { uuidSchema } from "../schemas/common.js";

export interface AuthUser {
  /** Subject claim: the authenticated user's id. */
  id: string;
  email?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    supabase: SupabaseClient;
    verifyAccessToken(token: string): Promise<AuthUser>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

interface SupabaseJwtPayload extends JWTPayload {
  sub?: string;
  email?: string;
  role?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Audience claim carried by Supabase user access tokens.
 *
 * The anon and service-role keys are JWTs too, so the audience is validated
 * explicitly to make sure only end-user sessions are accepted.
 */
const AUTHENTICATED_AUDIENCE = "authenticated";

export default fp(async (fastify) => {
  const env = fastify.env;

  const supabase = createClient(env.SUPABASE_URL, env.supabaseApiKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  fastify.decorate("supabase", supabase);

  const jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
  const expectedIssuer = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;

  async function verifyWithSecret(token: string, secret: string): Promise<SupabaseJwtPayload> {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: expectedIssuer,
      audience: AUTHENTICATED_AUDIENCE,
      requiredClaims: ["exp", "sub", "role"],
    });
    return payload as SupabaseJwtPayload;
  }

  async function verifyWithJwks(token: string): Promise<SupabaseJwtPayload> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: expectedIssuer,
      audience: AUTHENTICATED_AUDIENCE,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "sub", "role"],
    });
    return payload as SupabaseJwtPayload;
  }

  fastify.decorate("verifyAccessToken", async (token: string): Promise<AuthUser> => {
    let payload: SupabaseJwtPayload;
    try {
      // Select the verifier by algorithm; a rejected HS256 token must not
      // trigger an unnecessary network request to the JWKS endpoint.
      const { alg } = decodeProtectedHeader(token);
      if (alg === "HS256" && env.SUPABASE_JWT_SECRET) {
        payload = await verifyWithSecret(token, env.SUPABASE_JWT_SECRET);
      } else if (alg === "RS256" || alg === "ES256") {
        payload = await verifyWithJwks(token);
      } else {
        throw new Error("Unsupported signing algorithm");
      }
    } catch {
      throw fastify.httpErrors.unauthorized("Invalid or expired access token");
    }

    if (!uuidSchema.safeParse(payload.sub).success) {
      throw fastify.httpErrors.unauthorized("Invalid token identity");
    }

    // The `authenticated` role is what grants access to the API. Anonymous and
    // service-role tokens must never be accepted as a user session.
    if (payload.role !== "authenticated") {
      throw fastify.httpErrors.unauthorized("Access token does not carry an authenticated role");
    }

    if (payload.iss !== undefined && payload.iss !== expectedIssuer) {
      throw fastify.httpErrors.unauthorized("Access token was issued by an unknown issuer");
    }

    return {
      id: payload.sub!,
      email: isNonEmptyString(payload.email) ? payload.email : undefined,
    };
  });
});
