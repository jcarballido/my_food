/**
 * Runtime configuration.
 *
 * Only `VITE_`-prefixed variables are readable by the browser bundle. Values
 * are validated at startup so misconfiguration fails fast with a clear message
 * rather than surfacing as a confusing runtime error later.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function requireUrl(key: string): string {
  const value = requireEnv(key);
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${key} must be an HTTP(S) URL without credentials`);
  }
  return value;
}

export const config = {
  apiBaseUrl: requireUrl("VITE_API_BASE_URL").replace(/\/$/, ""),
  supabaseUrl: requireUrl("VITE_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("VITE_SUPABASE_ANON_KEY"),
  authCallbackUrl: requireUrl("VITE_AUTH_CALLBACK_URL"),
} as const;
