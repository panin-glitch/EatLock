/**
 * Environment configuration for TadLock.
 *
 * All secrets come from EXPO_PUBLIC_* environment variables.
 * Create a .env file at project root (see .env.example).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.warn(`[ENV] Missing environment variable: ${name}`);
    return '';
  }
  return value;
}

function optionalHttpsEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      console.warn(`[ENV] Ignoring non-HTTPS environment variable: ${name}`);
      return undefined;
    }
    return parsed.toString();
  } catch {
    console.warn(`[ENV] Ignoring invalid URL environment variable: ${name}`);
    return undefined;
  }
}

export const ENV = {
  // Supabase
  SUPABASE_URL: requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),

  // Cloudflare Worker API
  WORKER_API_URL: requireEnv('EXPO_PUBLIC_WORKER_API_URL'),

  // Optional secure web password reset destination
  PASSWORD_RESET_URL: optionalHttpsEnv('EXPO_PUBLIC_PASSWORD_RESET_URL'),

  // Deep link scheme (must match app.json)
  DEEP_LINK_SCHEME: 'tadlock',
} as const;
