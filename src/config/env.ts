/**
 * Environment configuration for TadLock.
 *
 * Replace placeholder values with your actual keys before building.
 * In production, use expo-constants or EAS secrets.
 */

export const ENV = {
  // Supabase
  SUPABASE_URL: 'https://xsbyxovfokeaqtdifahy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_HZsxX6GjmpnoPhCjrzOa5Q_XKhoHx1p',

  // Cloudflare Worker API
  WORKER_API_URL: 'https://eatlock-vision.crkmedia-us.workers.dev',

  // Deep link scheme (must match app.json)
  DEEP_LINK_SCHEME: 'tadlock',
} as const;
