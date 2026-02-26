import type { Env } from './index';

const MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPENAI_API = 'https://api.openai.com/v1/responses';
const SHORT_WINDOW_MS = 60 * 1000;
const NUTRITION_BURST_LIMIT = 6;
const ACTIVE_LIMIT = 3;

const burstBuckets = new Map<string, number[]>();
const activeBuckets = new Map<string, number[]>();

// ── Supabase RPC quota helper ────────────────

async function consumeNutritionQuota(
  env: Env,
  userId: string,
  limit: number,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_nutrition_quota`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
  });
  if (!res.ok) {
    console.error('[nutrition-quota] RPC error', res.status, await res.text().catch(() => ''));
    return { allowed: true, used: 0, limit };
  }
  return (await res.json()) as { allowed: boolean; used: number; limit: number };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

function parseCsvSet(raw?: string): Set<string> {
  return new Set((raw || '').split(',').map((v) => v.trim()).filter(Boolean));
}

function toLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function dailyLimitsDisabled(env: Env): boolean {
  const value = (env.DISABLE_DAILY_LIMITS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/** All rate-limiting + quota enforcement is OFF unless ENFORCE_LIMITS === "true" */
function limitsEnforced(env: Env): boolean {
  const value = (env.ENFORCE_LIMITS || '').trim().toLowerCase();
  return value === 'true';
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return Math.max(1, Math.floor((nextUtcMidnight - now.getTime()) / 1000));
}

function isDevBypassEnabled(request: Request, env: Env, userId: string): boolean {
  const bypassHeader = request.headers.get('x-dev-bypass')?.toLowerCase() === 'true';
  const bypassToken = request.headers.get('x-dev-bypass-token')?.trim();
  const allowedUsers = parseCsvSet(env.DEV_BYPASS_USER_IDS);
  const allowedTokens = parseCsvSet(env.DEV_BYPASS_TOKENS);
  const userAllowed = allowedUsers.has(userId);
  if (!userAllowed) return false;
  if (bypassHeader) return true;
  if (bypassToken && allowedTokens.has(bypassToken)) return true;
  return false;
}

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

function checkActive(key: string): boolean {
  const now = Date.now();
  const current = (activeBuckets.get(key) || []).filter((ts) => now - ts < SHORT_WINDOW_MS);
  if (current.length >= ACTIVE_LIMIT) {
    activeBuckets.set(key, current);
    return false;
  }
  current.push(now);
  activeBuckets.set(key, current);
  return true;
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

  console.log('[Auth] supabase host:', new URL(env.SUPABASE_URL).host);
  console.log('[Auth] token head:', jwt.slice(0, 12), 'len:', jwt.length);

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

async function r2ToDataUrl(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;

  const ct = obj.httpMetadata?.contentType || 'image/jpeg';
  if (ct.toLowerCase().split(';')[0] !== 'image/jpeg') {
    throw { status: 415, message: `Unsupported content type for ${key}` };
  }

  const bytes = await obj.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw { status: 413, message: `Image ${key} exceeds 5 MB limit` };
  }

  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }

  return `data:${ct};base64,${btoa(binary)}`;
}

const NUTRITION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'nutrition_estimate',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      food_label: { type: 'string' },
      estimated_calories: { type: 'number' },
      min_calories: { type: 'number' },
      max_calories: { type: 'number' },
      protein_g: { type: 'number' },
      carbs_g: { type: 'number' },
      fat_g: { type: 'number' },
      confidence: { type: 'number' },
      notes: { type: 'string' },
    },
    required: [
      'food_label',
      'estimated_calories',
      'min_calories',
      'max_calories',
      'protein_g',
      'carbs_g',
      'fat_g',
      'confidence',
      'notes',
    ],
    additionalProperties: false,
  },
};

const NUTRITION_SYSTEM = `You are a conservative calorie estimator for a meal-tracking app.
Given a single food photo, estimate total calories for what is visible.

CRITICAL RULES — avoid overestimation:
1. Default to SMALL/MEDIUM portions unless there are clear visual cues of a large serving.
   - A "bowl" of rice is ~150–200 g cooked unless it is visibly heaped.
   - A "plate" of pasta is ~180–250 g cooked unless it is a large restaurant portion.
   - A single fried egg ≈ 90 kcal.
   - Do NOT assume "full bowl" or "large plate" by default.
2. When uncertain about portion size, make min_calories and max_calories wide (±40 %).
3. Never claim certainty; set confidence < 0.7 for ambiguous photos.

ANCHOR TABLE (per typical home serving):
| Food              | Typical serving | kcal  |
|-------------------|----------------|-------|
| White rice        | 150 g cooked   | 195   |
| Pasta (cooked)    | 200 g cooked   | 260   |
| Chicken breast    | 120 g          | 200   |
| Beef stew (1 cup) | 240 ml         | 220   |
| French fries      | 100 g          | 310   |
| Pizza (1 slice)   | ~110 g         | 270   |
| Fried egg (1)     | 46 g           | 90    |
| Soda (330 ml can) | 330 ml         | 140   |
| Mixed salad, no dressing | 150 g   | 30    |

Use these as anchors. Scale up or down based on what you see.

Output STRICT JSON only. Always include protein_g, carbs_g, fat_g estimates. Use 0 if you truly cannot estimate a macro.`;

export async function handleNutritionEstimate(
  request: Request,
  env: Env,
): Promise<Response> {
  const nutritionDailyLimit = toLimit(env.NUTRITION_DAILY_LIMIT, 300);
  const enforce = limitsEnforced(env);

  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const bypassQuota = isDevBypassEnabled(request, env, auth.user_id);

  if (enforce && !checkActive(`nutrition-active:${auth.user_id}`)) {
    return err('Too many active scan requests. Please wait a moment.', 429);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (enforce) {
    const burstUserOk = checkBurst(`nutrition:user:${auth.user_id}`, NUTRITION_BURST_LIMIT, SHORT_WINDOW_MS);
    const burstIpOk = checkBurst(`nutrition:ip:${ip}`, NUTRITION_BURST_LIMIT * 2, SHORT_WINDOW_MS);
    if (!burstUserOk || !burstIpOk) {
      return err('Too many nutrition requests. Please slow down.', 429);
    }
  }

  let body: { r2Key?: string };
  try {
    body = (await request.json()) as { r2Key?: string };
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.r2Key || typeof body.r2Key !== 'string') {
    return err('Missing "r2Key" field');
  }
  if (Object.keys(body as Record<string, unknown>).length !== 1) {
    return err('nutrition estimate accepts exactly one image key', 400);
  }
  if (!body.r2Key.includes(auth.user_id)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    const dataUrl = await r2ToDataUrl(env.IMAGES, body.r2Key);
    if (!dataUrl) {
      return err('Image not found in R2 (expired or invalid key)', 404);
    }

    if (enforce && !bypassQuota && !dailyLimitsDisabled(env)) {
      const quota = await consumeNutritionQuota(env, auth.user_id, nutritionDailyLimit);
      if (!quota.allowed) {
        return err('Daily limit reached', 429, {
          kind: 'nutrition',
          limit: nutritionDailyLimit,
          remaining: 0,
          reset_in_seconds: secondsUntilUtcMidnight(),
        });
      }
    }

    const apiBody = {
      model: MODEL,
      instructions: NUTRITION_SYSTEM,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Estimate calories for this meal.' },
            { type: 'input_image', image_url: dataUrl, detail: 'low' },
          ],
        },
      ],
      text: { format: NUTRITION_SCHEMA },
    };

    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(apiBody),
    });

    if (!res.ok) {
      return err(`AI error: ${res.status}`, 502);
    }

    const data = (await res.json()) as {
      output: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
    };

    const msgOutput = data.output?.find((o: any) => o.type === 'message');
    const textContent = msgOutput?.content?.find((c: any) => c.type === 'output_text');
    if (!textContent?.text) {
      return err('No text in OpenAI response', 502);
    }

    return json(JSON.parse(textContent.text));
  } catch (e: any) {
    if (e.status === 413 || e.status === 415) return err(e.message, e.status);
    return err(`Nutrition estimation error: ${e.message}`, 502);
  }
}
