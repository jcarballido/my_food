import dotenv from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Loads `.env` files without overriding variables that are already present in
 * the process environment. Production deployments inject real environment
 * variables, so the file lookup is only a development convenience.
 */
function loadDotEnvFiles(): void {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  dotenv.config({ path: path.join(packageRoot, ".env"), quiet: true });
  dotenv.config({ path: path.resolve(packageRoot, "../../.env"), quiet: true });
}

loadDotEnvFiles();

const httpUrl = z.string().trim().url().refine((value) => {
  const url = new URL(value);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
}, "Must be an HTTP(S) URL without embedded credentials");

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: httpUrl,
  /**
   * Legacy HS256 signing secret. Optional: newer Supabase projects sign with
   * asymmetric keys that are published through the JWKS endpoint instead.
   */
  SUPABASE_JWT_SECRET: z.string().trim().min(1).optional(),
  /** Server-only key. Required to call the provider API when no anon key is set. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
  /** Client-safe key; sufficient for initiating magic-link sign-ins. */
  SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
  ALLOWED_EMAILS: z.string().trim().min(1, "ALLOWED_EMAILS is required"),
  AUTH_CALLBACK_URL: httpUrl,
  CORS_ORIGIN: z.string().trim().min(1, "CORS_ORIGIN is required"),
  APP_TIMEZONE: z.string().trim().min(1, "APP_TIMEZONE is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Pino log level; `silent` is used by the verification script. */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
});

export type Env = z.infer<typeof envSchema> & {
  /** Normalized, lower-cased allowlist. Never leaves the server. */
  allowedEmails: ReadonlySet<string>;
  /** Key used for provider API calls. */
  supabaseApiKey: string;
  /** Origins accepted by CORS. */
  corsOrigins: string[];
  isProduction: boolean;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAllowedEmails(raw: string): Set<string> {
  const emails = raw
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);

  if (emails.length === 0) {
    throw new Error("ALLOWED_EMAILS must contain at least one email address");
  }

  for (const email of emails) {
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error(`ALLOWED_EMAILS contains an invalid email address: ${email}`);
    }
  }

  return new Set(emails);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function loadEnv(processEnv: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(processEnv);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment configuration: ${message}`);
  }

  const base = parsed.data;

  if (!isValidTimezone(base.APP_TIMEZONE)) {
    throw new Error(
      `Invalid server environment configuration: APP_TIMEZONE is not a valid IANA timezone: ${base.APP_TIMEZONE}`,
    );
  }

  const supabaseApiKey = base.SUPABASE_ANON_KEY ?? base.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseApiKey) {
    throw new Error(
      "Invalid server environment configuration: SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is required",
    );
  }

  const corsOrigins = base.CORS_ORIGIN.split(",").map((origin) => origin.trim());
  if (corsOrigins.some((origin) =>
    !httpUrl.safeParse(origin).success || new URL(origin).origin !== origin
  )) {
    throw new Error("CORS_ORIGIN must contain complete HTTP(S) origins without paths");
  }
  if (!corsOrigins.includes(new URL(base.AUTH_CALLBACK_URL).origin)) {
    throw new Error("AUTH_CALLBACK_URL must use one of the configured CORS_ORIGIN origins");
  }

  return {
    ...base,
    allowedEmails: parseAllowedEmails(base.ALLOWED_EMAILS),
    supabaseApiKey,
    corsOrigins,
    isProduction: base.NODE_ENV === "production",
    logLevel: base.LOG_LEVEL ?? (base.NODE_ENV === "production" ? "info" : "debug"),
  };
}

export function isEmailAllowed(env: Env, email: string): boolean {
  return env.allowedEmails.has(normalizeEmail(email));
}
