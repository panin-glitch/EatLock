/**
 * Enrich a meal_nutrition row with micronutrient data.
 *
 * POST /v1/meals/:mealId/enrich_micros
 *
 * For barcode-sourced meals:  pulls extended nutrients from OpenFoodFacts.
 * For vision-sourced meals:   the main nutrition estimate already includes
 *                             fiber/sugar/sodium/sat-fat; this upserts them.
 *
 * Requires auth. Consumes nutrition quota if a new AI call is needed.
 */

import type { Env } from './index';
import { createClient } from '@supabase/supabase-js';
import { fetchOpenFoodFacts } from './barcode';

function serviceKey(env: Env): string {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '';
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
      apikey: serviceKey(env),
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

// ── Extended OFF nutrient keys ───────────────

interface OFFExtended {
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  micronutrients: Record<string, number>;
}

/**
 * Fetch extended micronutrients from OpenFoodFacts for a barcode.
 * Falls back to null for any nutrient not available.
 */
async function fetchExtendedOFF(barcode: string): Promise<OFFExtended | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { headers: { 'User-Agent': 'TadLock/1.0 (contact@tadlock.app)' } },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: number;
      product?: {
        nutriments?: Record<string, number | undefined>;
        serving_quantity?: number;
      };
    };
    if (data.status !== 1 || !data.product?.nutriments) return null;

    const n = data.product.nutriments;
    const sq = data.product.serving_quantity;

    function resolve(servingKey: string, per100Key: string): number | null {
      const ps = n[servingKey];
      if (ps != null && Number.isFinite(ps)) return ps;
      const p100 = n[per100Key];
      if (p100 != null && Number.isFinite(p100)) {
        if (sq != null && Number.isFinite(sq) && sq > 0) return (p100 * sq) / 100;
        return p100;
      }
      return null;
    }

    const microKeys: Array<[string, string, string]> = [
      ['vitamin_a_ug', 'vitamin-a_serving', 'vitamin-a_100g'],
      ['vitamin_c_mg', 'vitamin-c_serving', 'vitamin-c_100g'],
      ['calcium_mg', 'calcium_serving', 'calcium_100g'],
      ['iron_mg', 'iron_serving', 'iron_100g'],
      ['potassium_mg', 'potassium_serving', 'potassium_100g'],
      ['magnesium_mg', 'magnesium_serving', 'magnesium_100g'],
    ];

    const micronutrients: Record<string, number> = {};
    for (const [outKey, servKey, p100Key] of microKeys) {
      const val = resolve(servKey, p100Key);
      if (val != null) micronutrients[outKey] = Math.round(val * 10) / 10;
    }

    return {
      fiber_g: round1(resolve('fiber_serving', 'fiber_100g')),
      sugar_g: round1(resolve('sugars_serving', 'sugars_100g')),
      sodium_mg: round1(resolveMg(n, 'sodium_serving', 'sodium_100g', sq)),
      saturated_fat_g: round1(resolve('saturated-fat_serving', 'saturated-fat_100g')),
      micronutrients,
    };
  } catch (e) {
    console.error('[enrich_micros] OFF fetch error:', e);
    return null;
  }
}

function round1(v: number | null): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}

/** OFF stores sodium in grams; convert to mg. */
function resolveMg(
  n: Record<string, number | undefined>,
  servingKey: string,
  per100Key: string,
  sq: number | undefined,
): number | null {
  const ps = n[servingKey];
  if (ps != null && Number.isFinite(ps)) return ps * 1000;
  const p100 = n[per100Key];
  if (p100 != null && Number.isFinite(p100)) {
    if (sq != null && Number.isFinite(sq) && sq > 0) return (p100 * sq / 100) * 1000;
    return p100 * 1000;
  }
  return null;
}

// ── Route handler ────────────────────────────

export async function handleEnrichMicros(
  request: Request,
  env: Env,
  mealId: string,
): Promise<Response> {
  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  // Validate mealId looks like a UUID
  if (!/^[a-f0-9-]{36}$/.test(mealId)) {
    return err('Invalid meal ID', 400);
  }

  const supabase = createClient(env.SUPABASE_URL, serviceKey(env), {
    auth: { persistSession: false },
  });

  // 1. Look up the meal_nutrition row, ensure it belongs to this user
  const { data: meal, error: mealErr } = await supabase
    .from('meal_nutrition')
    .select('id, user_id, source, fiber_g, sugar_g, sodium_mg, saturated_fat_g, micronutrients, source_refs')
    .eq('id', mealId)
    .single();

  if (mealErr || !meal) {
    return err('Meal not found', 404);
  }

  if (meal.user_id !== auth.user_id) {
    return err('Meal does not belong to user', 403);
  }

  // 2. If already enriched, return existing data
  const alreadyEnriched = meal.fiber_g != null || meal.sugar_g != null || meal.sodium_mg != null;
  if (alreadyEnriched) {
    return json({
      enriched: true,
      fiber_g: meal.fiber_g,
      sugar_g: meal.sugar_g,
      sodium_mg: meal.sodium_mg,
      saturated_fat_g: meal.saturated_fat_g,
      micronutrients: meal.micronutrients || {},
      source_refs: meal.source_refs || [],
    });
  }

  // 3. Determine enrichment source based on how the meal was logged
  const sourceRefs: Array<Record<string, string>> = Array.isArray(meal.source_refs) ? meal.source_refs : [];

  // Check if there's a barcode source ref
  const barcodeRef = sourceRefs.find((r: Record<string, string>) => r.type === 'openfoodfacts');
  const barcode = barcodeRef?.barcode;

  let enrichData: {
    fiber_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
    micronutrients: Record<string, number>;
  } | null = null;

  let newSourceRef: Record<string, string> | null = null;

  if (barcode) {
    // Barcode-sourced: pull extended nutrients from OFF
    enrichData = await fetchExtendedOFF(barcode);
    if (enrichData) {
      newSourceRef = { type: 'openfoodfacts_micros', barcode };
    }
  }

  if (!enrichData) {
    // No barcode or OFF didn't have micros — return partial for now.
    // Vision-sourced meals already get fiber/sugar/sodium/sat-fat from the
    // main nutrition estimate (updated schema), so this path only triggers
    // for legacy meals without a barcode.
    return json({
      enriched: false,
      reason: 'no_micronutrient_source',
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      saturated_fat_g: null,
      micronutrients: {},
      source_refs: sourceRefs,
    });
  }

  // 4. Update the meal_nutrition row
  const updatedRefs = [...sourceRefs];
  if (newSourceRef) updatedRefs.push(newSourceRef);

  const { error: updateErr } = await supabase
    .from('meal_nutrition')
    .update({
      fiber_g: enrichData.fiber_g,
      sugar_g: enrichData.sugar_g,
      sodium_mg: enrichData.sodium_mg,
      saturated_fat_g: enrichData.saturated_fat_g,
      micronutrients: enrichData.micronutrients,
      source_refs: updatedRefs,
    })
    .eq('id', mealId)
    .eq('user_id', auth.user_id);

  if (updateErr) {
    console.error('[enrich_micros] Update error:', updateErr.message);
    return err('Failed to update meal nutrition', 500);
  }

  return json({
    enriched: true,
    fiber_g: enrichData.fiber_g,
    sugar_g: enrichData.sugar_g,
    sodium_mg: enrichData.sodium_mg,
    saturated_fat_g: enrichData.saturated_fat_g,
    micronutrients: enrichData.micronutrients,
    source_refs: updatedRefs,
  });
}
