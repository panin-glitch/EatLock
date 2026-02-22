/**
 * Environment configuration for EatLock.
 *
 * Replace placeholder values with your actual keys before building.
 * In production, use expo-constants or EAS secrets.
 */

export const ENV = {
  // Supabase
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

  // Cloudflare Worker API
  WORKER_API_URL: 'https://eatlock-api.YOUR_ACCOUNT.workers.dev',

  // Deep link scheme (must match app.json)
  DEEP_LINK_SCHEME: 'eatlock',
} as const;
