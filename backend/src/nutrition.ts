import type { Env } from './index';
import { ownsR2Key } from './utils/ownership';
import {
  acquireConcurrencySlot,
  consumeNutritionQuota,
  consumeRateLimit,
  dailyLimitsDisabled,
  limitsEnforced,
  releaseConcurrencySlot,
  secondsUntilUtcMidnight,
  serviceKey,
  toLimit,
} from './limits';

const MODEL_CANDIDATES = ['gpt-4o-mini', 'gpt-4.1-mini'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPENAI_API = 'https://api.openai.com/v1/responses';
const SHORT_WINDOW_SECONDS = 60;
const NUTRITION_BURST_LIMIT = 6;
const ACTIVE_LIMIT = 3;
const ACTIVE_SLOT_TTL_SECONDS = 10 * 60;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
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
      fiber_g: { type: 'number' },
      sugar_g: { type: 'number' },
      sodium_mg: { type: 'number' },
      saturated_fat_g: { type: 'number' },
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
      'fiber_g',
      'sugar_g',
      'sodium_mg',
      'saturated_fat_g',
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

Output STRICT JSON only. Always include protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, and saturated_fat_g estimates. Use 0 if you truly cannot estimate a value.`;

export async function handleNutritionEstimate(
  request: Request,
  env: Env,
): Promise<Response> {
  const nutritionDailyLimit = toLimit(env.NUTRITION_DAILY_LIMIT, 300);
  const enforce = limitsEnforced(env);

  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const activeBucket = `nutrition:active:${auth.user_id}`;
  let slotId: string | null = null;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (enforce) {
    const burstUserOk = await consumeRateLimit(
      env,
      `nutrition:user:${auth.user_id}`,
      NUTRITION_BURST_LIMIT,
      SHORT_WINDOW_SECONDS,
    );
    const burstIpOk = await consumeRateLimit(
      env,
      `nutrition:ip:${ip}`,
      NUTRITION_BURST_LIMIT * 2,
      SHORT_WINDOW_SECONDS,
    );
    if (!burstUserOk.allowed || !burstIpOk.allowed) {
      return err('Too many nutrition requests. Please slow down.', 429);
    }

    const slot = await acquireConcurrencySlot(env, activeBucket, ACTIVE_LIMIT, ACTIVE_SLOT_TTL_SECONDS);
    if (!slot.allowed) {
      return err('Too many active scan requests. Please wait a moment.', 429);
    }
    slotId = slot.slot_id;
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
  if (!ownsR2Key(auth.user_id, body.r2Key)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    const dataUrl = await r2ToDataUrl(env.IMAGES, body.r2Key);
    if (!dataUrl) {
      return err('Image not found in R2 (expired or invalid key)', 404);
    }

    if (enforce && !dailyLimitsDisabled(env)) {
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

    if (!env.OPENAI_API_KEY || !env.OPENAI_API_KEY.trim()) {
      return err('AI provider key is not configured', 502);
    }

    const models = [env.OPENAI_MODEL, ...MODEL_CANDIDATES].filter(
      (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
    );
    const retryDelayMs = [250, 700, 1400];
    let lastErr = 'AI service temporarily unavailable';

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const apiBody = {
          model,
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
          const raw = await res.text().catch(() => '');
          lastErr = `AI error: ${res.status}`;
          const lower = raw.toLowerCase();
          const modelIssue = lower.includes('model') && (lower.includes('not found') || lower.includes('do not have access'));
          const retryable = res.status >= 500 || res.status === 429;
          if (retryable && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
            continue;
          }
          if (modelIssue) {
            break;
          }
          return err(lastErr, 502);
        }

        const data = (await res.json()) as {
          output_text?: string;
          output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
        };

        const directText = typeof data.output_text === 'string' ? data.output_text : '';
        const msgOutput = data.output?.find((o: any) => o.type === 'message');
        const textContent = msgOutput?.content?.find((c: any) => c.type === 'output_text');
        const payloadText = directText || textContent?.text || '';
        if (!payloadText) {
          lastErr = 'No text in OpenAI response';
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
            continue;
          }
          break;
        }

        return json(JSON.parse(payloadText));
      }
    }

    return err(lastErr, 502);
  } catch (e: any) {
    if (e.status === 413 || e.status === 415) return err(e.message, e.status);
    return err('Nutrition estimation service unavailable', 502);
  } finally {
    await releaseConcurrencySlot(env, activeBucket, slotId);
  }
}
