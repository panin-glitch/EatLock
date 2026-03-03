/**
 * Update a meal's food_label (user edit).
 *
 * PUT /v1/meals/:mealId/food_label { food_label, detail? }
 *
 * Sets source='user' on the meal_nutrition row.
 */

import type { Env } from './index';
import { createClient } from '@supabase/supabase-js';

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
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
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

export async function handleUpdateFoodLabel(
  request: Request,
  env: Env,
  mealId: string,
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  if (!/^[a-f0-9-]{36}$/.test(mealId)) {
    return err('Invalid meal ID', 400);
  }

  let body: { food_label?: string; detail?: string };
  try {
    body = (await request.json()) as { food_label?: string; detail?: string };
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.food_label || typeof body.food_label !== 'string' || body.food_label.trim().length === 0) {
    return err('Missing or empty "food_label"');
  }

  const foodLabel = body.food_label.trim().slice(0, 120);
  const detail = body.detail?.trim().slice(0, 200) || null;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify ownership
  const { data: meal, error: mealErr } = await supabase
    .from('meal_nutrition')
    .select('id, user_id')
    .eq('id', mealId)
    .single();

  if (mealErr || !meal) {
    return err('Meal not found', 404);
  }

  if (meal.user_id !== auth.user_id) {
    return err('Meal does not belong to user', 403);
  }

  // Update
  const updatePayload: Record<string, unknown> = {
    food_label: foodLabel,
    source: 'user',
  };
  if (detail) {
    updatePayload.food_detail = detail;
  }

  const { error: updateErr } = await supabase
    .from('meal_nutrition')
    .update(updatePayload)
    .eq('id', mealId)
    .eq('user_id', auth.user_id);

  if (updateErr) {
    console.error('[food_label] Update error:', updateErr.message);
    return err('Failed to update food label', 500);
  }

  return json({ ok: true, food_label: foodLabel, detail });
}
