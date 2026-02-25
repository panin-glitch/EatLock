import type { Env } from './index';

const MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPENAI_API = 'https://api.openai.com/v1/responses';
const NUTRITION_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const SHORT_WINDOW_MS = 60 * 1000;
const NUTRITION_BURST_LIMIT = 6;
const ACTIVE_LIMIT = 3;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
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

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function checkRate(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
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
      confidence: { type: 'number' },
      notes: { type: 'string' },
    },
    required: [
      'food_label',
      'estimated_calories',
      'min_calories',
      'max_calories',
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

Output STRICT JSON only. Do not include macros if you cannot estimate them with reasonable confidence.`;

export async function handleNutritionEstimate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  // Persistent daily quota (DB-backed)
  const quota = await consumeNutritionQuota(env, auth.user_id, NUTRITION_LIMIT);
  if (!quota.allowed) {
    return err('Daily limit reached (10 nutrition estimates/day)', 429);
  }

  // In-memory daily rate limit (fast layer, secondary)
  if (!checkRate(`nutrition:${auth.user_id}`, NUTRITION_LIMIT)) {
    return err('Rate limit exceeded (10 nutrition estimates/day)', 429);
  }

  if (!checkActive(`nutrition-active:${auth.user_id}`)) {
    return err('Too many active scan requests. Please wait a moment.', 429);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const burstUserOk = checkBurst(`nutrition:user:${auth.user_id}`, NUTRITION_BURST_LIMIT, SHORT_WINDOW_MS);
  const burstIpOk = checkBurst(`nutrition:ip:${ip}`, NUTRITION_BURST_LIMIT * 2, SHORT_WINDOW_MS);
  if (!burstUserOk || !burstIpOk) {
    return err('Too many nutrition requests. Please slow down.', 429);
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
