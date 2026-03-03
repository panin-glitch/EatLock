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

export const ENV = {
  // Supabase
  SUPABASE_URL: requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),

  // Cloudflare Worker API
  WORKER_API_URL: requireEnv('EXPO_PUBLIC_WORKER_API_URL'),

  // Deep link scheme (must match app.json)
  DEEP_LINK_SCHEME: 'tadlock',
} as const;
