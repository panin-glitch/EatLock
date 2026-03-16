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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function requireApiUrlEnv(name: string): string {
  const value = requireEnv(name).trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    const secure = parsed.protocol === 'https:';
    const allowedLocalHttp = parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname);
    if (!secure && !allowedLocalHttp) {
      console.warn(`[ENV] Ignoring insecure environment variable: ${name}`);
      return '';
    }
    return parsed.toString();
  } catch {
    console.warn(`[ENV] Ignoring invalid URL environment variable: ${name}`);
    return '';
  }
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
  SUPABASE_URL: requireApiUrlEnv('EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),

  // Cloudflare Worker API
  WORKER_API_URL: requireApiUrlEnv('EXPO_PUBLIC_WORKER_API_URL'),

  // Optional secure web password reset destination
  PASSWORD_RESET_URL: optionalHttpsEnv('EXPO_PUBLIC_PASSWORD_RESET_URL'),

  // RevenueCat public SDK configuration
  REVENUECAT_APPLE_API_KEY: requireEnv('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY'),
  REVENUECAT_ENTITLEMENT_ID: requireEnv('EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID'),
  REVENUECAT_OFFERING_ID: requireEnv('EXPO_PUBLIC_REVENUECAT_OFFERING_ID'),
  REVENUECAT_MONTHLY_PRODUCT_ID: requireEnv('EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID'),
  REVENUECAT_YEARLY_PRODUCT_ID: requireEnv('EXPO_PUBLIC_REVENUECAT_YEARLY_PRODUCT_ID'),

  // Deep link scheme (must match app.json)
  DEEP_LINK_SCHEME: 'tadlock',
} as const;
