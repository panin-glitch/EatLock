/**
 * Barcode lookup handler.
 *
 * POST /v1/barcode/lookup { barcode }
 *
 * 1. Check barcode_cache in Supabase.
 * 2. If miss, fetch from OpenFoodFacts.
 * 3. Cache result in barcode_cache (service role write).
 * 4. Return { name, calories, protein_g, carbs_g, fat_g, serving_hint }.
 */

import type { Env } from './index';
import { createClient } from '@supabase/supabase-js';

// ── Burst rate limiting ──────────────────────

const BARCODE_BURST_LIMIT = 10;
const SHORT_WINDOW_MS = 60 * 1000;
const burstBuckets = new Map<string, number[]>();

function checkBurst(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = (burstBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (current.length >= limit) {
    burstBuckets.set(key, current);
    return false;
  }
  current.push(now);
  burstBuckets.set(key, current);
  return true;
}

// ── Helpers ──────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function getUser(
  request: Request,
  env: Env,
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err('Missing or invalid Authorization header', 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (jwt.split('.').length !== 3) {
    return err('Invalid or expired token', 401);
  }

  const whoamiRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (whoamiRes.status === 401 || !whoamiRes.ok) {
    return err('Invalid or expired token', 401);
  }

  const whoami = (await whoamiRes.json().catch(() => null)) as { id?: string } | null;
  if (!whoami?.id) {
    return err('Invalid or expired token', 401);
  }

  return { user_id: whoami.id };
}

// ── OpenFoodFacts fetch ──────────────────────

interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'energy-kcal_serving'?: number;
  proteins_100g?: number;
  proteins_serving?: number;
  carbohydrates_100g?: number;
  carbohydrates_serving?: number;
  fat_100g?: number;
  fat_serving?: number;
}

interface OFFProduct {
  product_name?: string;
  nutriments?: OFFNutriments;
  serving_size?: string;
  serving_quantity?: number;
}

interface BarcodeLookupResult {
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_hint: string | null;
  /** True when values are per 100 g (no serving data available). */
  per_100g: boolean;
}

/**
 * Resolve a single nutrient value to per-serving.
 * Priority: per-serving field → computed from per-100g + serving_quantity → per-100g fallback.
 * Returns [value | null, usedPer100g].
 */
function resolveNutrient(
  perServing: number | undefined,
  per100g: number | undefined,
  servingQty: number | undefined,
): [number | null, boolean] {
  if (perServing != null && Number.isFinite(perServing)) {
    return [perServing, false];
  }
  if (per100g != null && Number.isFinite(per100g)) {
    if (servingQty != null && Number.isFinite(servingQty) && servingQty > 0) {
      return [per100g * servingQty / 100, false];
    }
    return [per100g, true];
  }
  return [null, false];
}

function round1(v: number | null): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}

export async function fetchOpenFoodFacts(barcode: string): Promise<BarcodeLookupResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { 'User-Agent': 'TadLock/1.0 (contact@tadlock.app)' } },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as { status: number; product?: OFFProduct };
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n: OFFNutriments = p.nutriments ?? {};
    const sq = p.serving_quantity;

    const [cal, calPer100g] = resolveNutrient(n['energy-kcal_serving'], n['energy-kcal_100g'], sq);
    const [pro, proPer100g] = resolveNutrient(n.proteins_serving, n.proteins_100g, sq);
    const [carb, carbPer100g] = resolveNutrient(n.carbohydrates_serving, n.carbohydrates_100g, sq);
    const [fat, fatPer100g] = resolveNutrient(n.fat_serving, n.fat_100g, sq);

    // per_100g is true when ALL resolved values fell back to the raw per-100g column
    const per100g = calPer100g || proPer100g || carbPer100g || fatPer100g;

    return {
      name: p.product_name || 'Unknown item',
      calories: cal != null ? Math.round(cal) : null,
      protein_g: round1(pro),
      carbs_g: round1(carb),
      fat_g: round1(fat),
      serving_hint: p.serving_size || null,
      per_100g: per100g,
    };
  } catch (e) {
    console.error('[barcode] OpenFoodFacts fetch error:', e);
    return null;
  }
}

// ── Route handler ────────────────────────────

export async function handleBarcodeLookup(
  request: Request,
  env: Env,
): Promise<Response> {
  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  // Per-IP + per-user burst limit
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const burstUserOk = checkBurst(`barcode:user:${auth.user_id}`, BARCODE_BURST_LIMIT, SHORT_WINDOW_MS);
  const burstIpOk = checkBurst(`barcode:ip:${ip}`, BARCODE_BURST_LIMIT * 2, SHORT_WINDOW_MS);
  if (!burstUserOk || !burstIpOk) {
    return err('Too many barcode requests. Please slow down.', 429);
  }

  let body: { barcode?: string };
  try {
    body = (await request.json()) as { barcode?: string };
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.barcode || typeof body.barcode !== 'string' || body.barcode.length < 4) {
    return err('Missing or invalid "barcode" field');
  }

  const barcode = body.barcode.trim();

  // 1. Check cache
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: cached } = await supabase
    .from('barcode_cache')
    .select('product_name, calories_per_serving, serving_size, raw_data')
    .eq('barcode', barcode)
    .single();

  if (cached) {
    const raw = (cached.raw_data || {}) as Record<string, unknown>;
    return json({
      name: cached.product_name || 'Unknown item',
      calories: cached.calories_per_serving ?? null,
      protein_g: (raw.protein_g as number) ?? null,
      carbs_g: (raw.carbs_g as number) ?? null,
      fat_g: (raw.fat_g as number) ?? null,
      serving_hint: cached.serving_size || null,
      per_100g: !!(raw.per_100g),
      source: 'cache',
    });
  }

  // 2. Fetch from OpenFoodFacts
  const result = await fetchOpenFoodFacts(barcode);

  if (!result) {
    return json({
      name: 'Unknown item',
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      serving_hint: null,
      per_100g: false,
      source: 'not_found',
    });
  }

  // 3. Cache in Supabase (async, don't block response)
  supabase
    .from('barcode_cache')
    .upsert(
      {
        barcode,
        barcode_type: 'ean13',
        product_name: result.name,
        calories_per_serving: result.calories,
        serving_size: result.serving_hint,
        source_api: 'openfoodfacts',
        raw_data: {
          protein_g: result.protein_g,
          carbs_g: result.carbs_g,
          fat_g: result.fat_g,
          per_100g: result.per_100g,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'barcode' },
    )
    .then(({ error: cacheErr }) => {
      if (cacheErr) console.error('[barcode] Cache write failed:', cacheErr.message);
    });

  return json({
    ...result,
    source: 'openfoodfacts',
  });
}
