import type { Env } from './index';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

export interface ConcurrencyDecision {
  allowed: boolean;
  active: number;
  limit: number;
  slot_id: string | null;
}

export interface CooldownDecision {
  active: boolean;
  remaining_seconds: number;
}

export function serviceKey(env: { SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_SERVICE_KEY?: string }): string {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '';
}

async function callRpc<T>(
  env: Env,
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${serviceKey(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`[${name}] ${res.status}: ${raw.slice(0, 200)}`);
  }

  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

export function toLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function limitsEnforced(env: Env): boolean {
  return (env.ENFORCE_LIMITS || '').trim().toLowerCase() === 'true';
}

export function dailyLimitsDisabled(env: Env): boolean {
  const value = (env.DISABLE_DAILY_LIMITS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}

export async function consumeVisionQuota(
  env: Env,
  userId: string,
  kind: string,
  limit: number,
): Promise<QuotaDecision> {
  try {
    return await callRpc<QuotaDecision>(env, 'consume_vision_quota', {
      p_user_id: userId,
      p_kind: kind,
      p_limit: limit,
    });
  } catch (error) {
    console.error('[quota] vision RPC failed:', error);
    return { allowed: false, used: limit, limit };
  }
}

export async function consumeNutritionQuota(
  env: Env,
  userId: string,
  limit: number,
): Promise<QuotaDecision> {
  try {
    return await callRpc<QuotaDecision>(env, 'consume_nutrition_quota', {
      p_user_id: userId,
      p_limit: limit,
    });
  } catch (error) {
    console.error('[quota] nutrition RPC failed:', error);
    return { allowed: false, used: limit, limit };
  }
}

export async function consumeRateLimit(
  env: Env,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  try {
    return await callRpc<RateLimitDecision>(env, 'consume_rate_limit', {
      p_bucket_key: bucketKey,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
  } catch (error) {
    console.error('[rate-limit] consume_rate_limit failed:', error);
    return { allowed: false, used: limit, limit };
  }
}

export async function acquireConcurrencySlot(
  env: Env,
  bucketKey: string,
  limit: number,
  ttlSeconds: number,
): Promise<ConcurrencyDecision> {
  try {
    return await callRpc<ConcurrencyDecision>(env, 'acquire_rate_limit_slot', {
      p_bucket_key: bucketKey,
      p_limit: limit,
      p_ttl_seconds: ttlSeconds,
    });
  } catch (error) {
    console.error('[rate-limit] acquire_rate_limit_slot failed:', error);
    return { allowed: false, active: limit, limit, slot_id: null };
  }
}

export async function releaseConcurrencySlot(
  env: Env,
  bucketKey: string,
  slotId: string | null | undefined,
): Promise<void> {
  if (!slotId) return;
  try {
    await callRpc(env, 'release_rate_limit_slot', {
      p_bucket_key: bucketKey,
      p_slot_id: slotId,
    });
  } catch (error) {
    console.warn('[rate-limit] release_rate_limit_slot failed:', error);
  }
}

export async function getCooldownStatus(
  env: Env,
  bucketKey: string,
): Promise<CooldownDecision> {
  try {
    return await callRpc<CooldownDecision>(env, 'get_rate_limit_cooldown', {
      p_bucket_key: bucketKey,
    });
  } catch (error) {
    console.error('[rate-limit] get_rate_limit_cooldown failed:', error);
    return { active: false, remaining_seconds: 0 };
  }
}

export async function setCooldown(
  env: Env,
  bucketKey: string,
  seconds: number,
): Promise<void> {
  try {
    await callRpc(env, 'set_rate_limit_cooldown', {
      p_bucket_key: bucketKey,
      p_cooldown_seconds: seconds,
    });
  } catch (error) {
    console.warn('[rate-limit] set_rate_limit_cooldown failed:', error);
  }
}