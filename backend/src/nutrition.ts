/**
 * Nutrition estimation handler.
 *
 * POST /v1/nutrition/estimate — estimate calories from a food image.
 *
 * Uses gpt-4o-mini with detail:"low" for cheap, fast calorie estimation.
 * Strict JSON schema output. Rate-limited to 10/day per user.
 */

import type { Env } from './index';
import type { SupabaseClient } from '@supabase/supabase-js';

const MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPENAI_API = 'https://api.openai.com/v1/responses';
const NUTRITION_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Rate limiting (in-memory, per cold-start)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRate(key: string, limit: number): { ok: boolean } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= limit) return { ok: false };
  bucket.count++;
  return { ok: true };
}

// ── Helpers ──

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
  supabase: SupabaseClient,
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.slice(7);
  const { data, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !data.user) {
    return err('Invalid or expired token', 401);
  }
  return { user_id: data.user.id };
}

async function r2ToDataUrl(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;

  const bytes = await obj.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw { status: 413, message: `Image ${key} exceeds 5 MB limit` };
  }

  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const b64 = btoa(binary);
  const ct = obj.httpMetadata?.contentType || 'image/jpeg';
  return `data:${ct};base64,${b64}`;
}

// ── Schema & Prompt ──

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
      protein_g: { type: ['number', 'null'] },
      carbs_g: { type: ['number', 'null'] },
      fat_g: { type: ['number', 'null'] },
    },
    required: [
      'food_label',
      'estimated_calories',
      'min_calories',
      'max_calories',
      'confidence',
      'notes',
      'protein_g',
      'carbs_g',
      'fat_g',
    ],
    additionalProperties: false,
  },
};

const NUTRITION_SYSTEM = `You are a nutrition estimation assistant. Given a photo of food on a plate, estimate the total calories and macros for the ENTIRE visible meal.

Rules:
- Identify the food items visible.
- Estimate portion sizes visually (small, medium, large).
- Return a single recommended calorie estimate, plus a min/max range.
- Estimate macros (protein_g, carbs_g, fat_g) if possible. If you cannot estimate them with reasonable confidence, return null for them.
- Confidence is 0-1 (1 = very confident, e.g. a single well-known item; 0.3 = uncertain, mixed/unclear items).
- food_label should be a short description like "Grilled chicken with rice and salad".
- notes should mention key assumptions (e.g. "Assumed medium portion, no dressing").
- This is an ESTIMATE. Never claim certainty.
- Keep food_label under 50 characters.
- Keep notes under 80 characters.`;

// ── Handler ──

export async function handleNutritionEstimate(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
): Promise<Response> {
  const auth = await getUser(request, supabase);
  if (auth instanceof Response) return auth;

  const rate = checkRate(`nutrition:${auth.user_id}`, NUTRITION_LIMIT);
  if (!rate.ok) {
    return err('Rate limit exceeded (10 nutrition estimates/day)', 429);
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
            { type: 'input_text', text: 'Estimate the calories and macros for this meal.' },
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
      const text = await res.text();
      console.error('[nutrition/estimate] OpenAI error:', res.status, text.slice(0, 300));
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

    const result = JSON.parse(textContent.text);
    return json(result);
  } catch (e: any) {
    if (e.status === 413) return err(e.message, 413);
    console.error('[nutrition/estimate]', e);
    return err(`Nutrition estimation error: ${e.message}`, 502);
  }
}
