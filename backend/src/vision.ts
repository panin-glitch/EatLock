/**
 * GPT Vision verification handlers (R2-based).
 *
 * POST /v1/vision/verify-food   — single-image food check via r2Key
 * POST /v1/vision/compare-meal  — before/after comparison via preKey/postKey
 *
 * Images are downloaded from R2, converted to base64 data-URLs, and sent to
 * OpenAI Responses API with Structured Outputs (strict JSON schema).
 *
 * Auth: Supabase Bearer token required.
 * Rate-limited per user_id:  150 verify/day, 10 compare/day.
 * Max image size: 5 MB per object.
 */

import type { Env } from './index';
import { ownsR2Key } from './utils/ownership';
import {
  acquireConcurrencySlot,
  consumeRateLimit,
  consumeVisionQuota,
  dailyLimitsDisabled,
  getCooldownStatus,
  limitsEnforced,
  releaseConcurrencySlot,
  secondsUntilUtcMidnight,
  serviceKey,
  setCooldown,
  toLimit,
} from './limits';

// ── Supabase RPC quota helper ────────────────

async function consumeQuota(
  env: Env,
  userId: string,
  kind: string,
  limit: number,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_vision_quota`, {
    method: 'POST',
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${serviceKey(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_kind: kind, p_limit: limit }),
  });
  if (!res.ok) {
    console.error('[quota] RPC error', res.status, await res.text().catch(() => ''));
    // Fail closed if quota RPC is unavailable while enforcement is on.
    return { allowed: false, used: limit, limit };
  }
  return (await res.json()) as { allowed: boolean; used: number; limit: number };
}

// ── Constants ────────────────────────────────

const MODEL_CANDIDATES = ['gpt-4o-mini', 'gpt-4.1-mini'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const OPENAI_API = 'https://api.openai.com/v1/responses';

// Rate-limit windows (per user_id, durable/shared via Supabase RPCs)
const SHORT_WINDOW_SECONDS = 60;
const VERIFY_BURST_LIMIT = 10;
const COMPARE_BURST_LIMIT = 6;
const CONCURRENT_LIMIT = 3;
const CONCURRENT_TTL_SECONDS = 10 * 60;
const NOT_FOOD_WINDOW_SECONDS = 10 * 60;
const NOT_FOOD_LIMIT = 10;
const NOT_FOOD_COOLDOWN_SECONDS = 5 * 60;

// ── Helpers ──────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status);
}

/** Download an R2 object as a base64 data-URL. Returns null if not found. */
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

  // Convert to base64
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const b64 = btoa(binary);
  return `data:${ct};base64,${b64}`;
}

/** Validate Supabase Bearer token → user_id or error Response */
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

// ── JSON Schemas for Structured Outputs ──────

const FOOD_CHECK_SCHEMA = {
  type: 'json_schema' as const,
  name: 'food_check',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      isFood: { type: 'boolean' },
      confidence: { type: 'number' },
      hasPlateOrBowl: { type: 'boolean' },
      quality: {
        type: 'object',
        properties: {
          brightness: { type: 'number' },
          blur: { type: 'number' },
          framing: { type: 'number' },
        },
        required: ['brightness', 'blur', 'framing'],
        additionalProperties: false,
      },
      reasonCode: {
        type: 'string',
        enum: ['OK', 'NOT_FOOD', 'HAND_SELFIE', 'TOO_DARK', 'TOO_BLURRY', 'NO_PLATE', 'BAD_FRAMING'],
      },
      roastLine: { type: 'string' },
      retakeHint: { type: 'string' },
    },
    required: ['isFood', 'confidence', 'hasPlateOrBowl', 'quality', 'reasonCode', 'roastLine', 'retakeHint'],
    additionalProperties: false,
  },
};

const COMPARE_SCHEMA = {
  type: 'json_schema' as const,
  name: 'compare_meal',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      isSameScene: { type: 'boolean' },
      duplicateScore: { type: 'number' },
      foodChangeScore: { type: 'number' },
      verdict: { type: 'string', enum: ['EATEN', 'PARTIAL', 'UNCHANGED', 'UNVERIFIABLE'] },
      confidence: { type: 'number' },
      reasonCode: {
        type: 'string',
        enum: ['OK', 'DUPLICATE_AFTER', 'UNCHANGED', 'PARTIAL', 'ANGLE_MISMATCH', 'LIGHTING_MISMATCH', 'CANT_TELL'],
      },
      roastLine: { type: 'string' },
      retakeHint: { type: 'string' },
    },
    required: ['isSameScene', 'duplicateScore', 'foodChangeScore', 'verdict', 'confidence', 'reasonCode', 'roastLine', 'retakeHint'],
    additionalProperties: false,
  },
};

// ── Prompts ──────────────────────────────────

const VERIFY_SYSTEM = `You are TadLock's meal-photo verifier.
Goal: avoid false negatives. If edible food or drink is visible, accept it (isFood=true).
Reject ONLY when clearly not a meal photo: selfies, hand-only shots, screenshots, random objects, or no edible item.
Do not require perfect lighting or framing to accept a real meal.
Use reasonCode NOT_FOOD or HAND_SELFIE only when highly certain no edible item is present.
Write a short witty roastLine (max 18 words, include 1-2 emojis). If rejected, provide a helpful retakeHint (max 15 words).
If accepted (isFood=true), set reasonCode to "OK", roastLine to a compliment, and retakeHint to empty string.
quality.brightness/blur/framing are 0-1 scores (1 = perfect).
Confidence is 0-1.`;

const COMPARE_SYSTEM = `You are TadLock's before/after meal comparison AI.
You receive two photos: BEFORE eating (first) and AFTER eating (second).
Determine how much food was consumed.

CRITICAL — Scene consistency check (do this FIRST):
- isSameScene: Both photos must show the same table, plate/container, and general setting.
- If the plate, bowl, or container is clearly different between photos → verdict=UNVERIFIABLE, reasonCode="CANT_TELL"
- If the angle is so different you can't confirm it's the same meal → verdict=UNVERIFIABLE, reasonCode="ANGLE_MISMATCH"
- If lighting changed so much it's unrecognizable → verdict=UNVERIFIABLE, reasonCode="LIGHTING_MISMATCH"
- Do NOT accuse the user of cheating. Simply request a retake in retakeHint.

Verdicts (only if isSameScene is true):
- EATEN: plate is clearly emptier (foodChangeScore > 0.75)
- PARTIAL: some food gone but visible leftovers (0.25 < foodChangeScore <= 0.75)
- UNCHANGED: food looks the same as before (foodChangeScore <= 0.25)
- UNVERIFIABLE: can't tell (different angle, lighting, blurry, or photos don't match)
- duplicateScore: 0 = completely different, 1 = identical (detect duplicate/resubmitted photos)
- If duplicateScore > 0.9 → reasonCode = "DUPLICATE_AFTER"
- foodChangeScore: 0 = no change, 1 = all food gone

Write a short witty roastLine (max 18 words, 1-2 emojis). Keep roasts light, never accusatory.
Provide retakeHint when UNVERIFIABLE (e.g. "Try taking the after photo from the same angle").
Confidence is 0-1.`;

// ── OpenAI Responses API call ────────────────

interface OpenAIInput {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'low' | 'high' }
  >;
}

async function callOpenAI(
  env: Env,
  systemPrompt: string,
  input: OpenAIInput[],
  schema: typeof FOOD_CHECK_SCHEMA | typeof COMPARE_SCHEMA,
): Promise<unknown> {
  const maxAttempts = 3;
  const retryDelayMs = [250, 700, 1400];
  const models = [env.OPENAI_MODEL, ...MODEL_CANDIDATES].filter(
    (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
  );

  if (!env.OPENAI_API_KEY || !env.OPENAI_API_KEY.trim()) {
    throw new Error('OpenAI API key is not configured');
  }

  let lastError: Error | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const body = {
          model,
          instructions: systemPrompt,
          input,
          text: { format: schema },
        };
        const res = await fetch(OPENAI_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          const lowerText = text.toLowerCase();
          const modelIssue = lowerText.includes('model') && (lowerText.includes('not found') || lowerText.includes('do not have access'));
          const isRetryable = res.status >= 500 || res.status === 429;
          if (isRetryable && attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
            continue;
          }
          if (modelIssue) {
            throw new Error(`OpenAI model issue for ${model}: ${text.slice(0, 300)}`);
          }
          throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
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
          throw new Error('No text in OpenAI response');
        }

        return JSON.parse(payloadText);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const message = String(lastError.message || '').toLowerCase();
        const retryable =
          message.includes('openai 5') ||
          message.includes('openai 429') ||
          message.includes('timeout') ||
          message.includes('1101') ||
          message.includes('internal error');
        if (retryable && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
          continue;
        }
        const modelIssue = message.includes('model issue') || (message.includes('model') && message.includes('access'));
        if (modelIssue) {
          break;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error('OpenAI call failed');
}

// ── Route Handlers ───────────────────────────

export async function handleVerifyFood(
  request: Request,
  env: Env,
): Promise<Response> {
  const verifyDailyLimit = toLimit(env.VERIFY_DAILY_LIMIT, 1000);
  const enforce = limitsEnforced(env);

  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const cooldownBucket = `vision:verify:cooldown:${auth.user_id}`;
  const activeBucket = `vision:verify:active:${auth.user_id}`;
  let slotId: string | null = null;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  console.log('[verify-food] request start', { user_id: auth.user_id, ip, enforce });
  if (enforce) {
    const cooldown = await getCooldownStatus(env, cooldownBucket);
    if (cooldown.active) {
      return json({
        error: 'Too many failed scans, try again in 5 minutes.',
        retry_after_seconds: cooldown.remaining_seconds,
      }, 429);
    }

    const burstUserOk = await consumeRateLimit(
      env,
      `vision:verify:user:${auth.user_id}`,
      VERIFY_BURST_LIMIT,
      SHORT_WINDOW_SECONDS,
    );
    const burstIpOk = await consumeRateLimit(
      env,
      `vision:verify:ip:${ip}`,
      VERIFY_BURST_LIMIT * 2,
      SHORT_WINDOW_SECONDS,
    );
    if (!burstUserOk.allowed || !burstIpOk.allowed) {
      console.warn('[verify-food] burst limited', { user_id: auth.user_id, ip });
      return json({ error: 'Too many requests', retry_after_seconds: 30 }, 429);
    }

    const slot = await acquireConcurrencySlot(env, activeBucket, CONCURRENT_LIMIT, CONCURRENT_TTL_SECONDS);
    if (!slot.allowed) {
      return err('Too many active scan requests. Please wait a moment.', 429);
    }
    slotId = slot.slot_id;
  }

  // Parse body
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
    return err('verify-food accepts exactly one image key', 400);
  }

  // Validate key belongs to this user
  if (!ownsR2Key(auth.user_id, body.r2Key)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    // Download from R2
    const dataUrl = await r2ToDataUrl(env.IMAGES, body.r2Key);
    if (!dataUrl) {
      return err('Image not found in R2 (expired or invalid key)', 404);
    }

    if (enforce && !dailyLimitsDisabled(env)) {
      const quota = await consumeQuota(env, auth.user_id, 'verify', verifyDailyLimit);
      if (!quota.allowed) {
        console.warn('[verify-food] daily quota reached', { user_id: auth.user_id, limit: verifyDailyLimit });
        return json({
          error: 'Daily limit reached',
          kind: 'verify',
          limit: verifyDailyLimit,
          remaining: 0,
          reset_in_seconds: secondsUntilUtcMidnight(),
        }, 429);
      }
    }

    const input: OpenAIInput[] = [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Verify this meal photo.' },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ],
      },
    ];

    const result = await callOpenAI(env, VERIFY_SYSTEM, input, FOOD_CHECK_SCHEMA);
    console.log('[verify-food] OpenAI success', { user_id: auth.user_id });

    const typed = result as { isFood?: boolean };
    if (enforce && typed?.isFood === false) {
      const failureWindow = await consumeRateLimit(
        env,
        `vision:verify:failed:${auth.user_id}`,
        NOT_FOOD_LIMIT,
        NOT_FOOD_WINDOW_SECONDS,
      );
      if (!failureWindow.allowed) {
        await setCooldown(env, cooldownBucket, NOT_FOOD_COOLDOWN_SECONDS);
      }
    }

    // Do NOT delete the R2 object here — it may be needed for compare-meal later.
    return json(result);
  } catch (e: any) {
    if (e.status === 413) return err(e.message, 413);
    console.error('[verify-food] failure', {
      user_id: auth.user_id,
      message: e?.message,
      stack: e?.stack,
    });
    return err('Vision service unavailable', 502);
  } finally {
    await releaseConcurrencySlot(env, activeBucket, slotId);
  }
}

export async function handleCompareMeal(
  request: Request,
  env: Env,
): Promise<Response> {
  const compareDailyLimit = toLimit(env.COMPARE_DAILY_LIMIT, 300);
  const enforce = limitsEnforced(env);

  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const activeBucket = `vision:compare:active:${auth.user_id}`;
  let slotId: string | null = null;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (enforce) {
    const burstUserOk = await consumeRateLimit(
      env,
      `vision:compare:user:${auth.user_id}`,
      COMPARE_BURST_LIMIT,
      SHORT_WINDOW_SECONDS,
    );
    const burstIpOk = await consumeRateLimit(
      env,
      `vision:compare:ip:${ip}`,
      COMPARE_BURST_LIMIT * 2,
      SHORT_WINDOW_SECONDS,
    );
    if (!burstUserOk.allowed || !burstIpOk.allowed) {
      return err('Too many compare requests. Please slow down.', 429);
    }

    const slot = await acquireConcurrencySlot(env, activeBucket, CONCURRENT_LIMIT, CONCURRENT_TTL_SECONDS);
    if (!slot.allowed) {
      return err('Too many active scan requests. Please wait a moment.', 429);
    }
    slotId = slot.slot_id;
  }

  // Parse body
  let body: { preKey?: string; postKey?: string };
  try {
    body = (await request.json()) as { preKey?: string; postKey?: string };
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.preKey || !body.postKey) {
    return err('Missing "preKey" and/or "postKey" fields');
  }
  if (Object.keys(body as Record<string, unknown>).length !== 2) {
    return err('compare-meal requires exactly preKey and postKey', 400);
  }

  // Ownership check
  if (!ownsR2Key(auth.user_id, body.preKey) || !ownsR2Key(auth.user_id, body.postKey)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    // Download both images from R2
    const [beforeUrl, afterUrl] = await Promise.all([
      r2ToDataUrl(env.IMAGES, body.preKey),
      r2ToDataUrl(env.IMAGES, body.postKey),
    ]);

    if (!beforeUrl || !afterUrl) {
      return err('One or both images not found in R2 (expired or invalid key)', 404);
    }

    if (enforce && !dailyLimitsDisabled(env)) {
      const quota = await consumeQuota(env, auth.user_id, 'compare', compareDailyLimit);
      if (!quota.allowed) {
        return json({
          error: 'Daily limit reached',
          kind: 'compare',
          limit: compareDailyLimit,
          remaining: 0,
          reset_in_seconds: secondsUntilUtcMidnight(),
        }, 429);
      }
    }

    // First attempt: detail:"low"
    let result = await callCompare(env, beforeUrl, afterUrl, 'low');

    // Auto-retry with detail:"high" if UNVERIFIABLE + low confidence
    const parsed = result as { verdict: string; confidence: number };
    if (parsed.verdict === 'UNVERIFIABLE' && parsed.confidence < 0.55) {
      console.log('[compare-meal] Retrying with detail:high');
      result = await callCompare(env, beforeUrl, afterUrl, 'high');
    }

    // Cleanup: delete both R2 objects after returning result
    await Promise.allSettled([
      env.IMAGES.delete(body.preKey),
      env.IMAGES.delete(body.postKey),
    ]);

    return json(result);
  } catch (e: any) {
    if (e.status === 413) return err(e.message, 413);
    console.error('[compare-meal]', e);
    return err('Vision service unavailable', 502);
  } finally {
    await releaseConcurrencySlot(env, activeBucket, slotId);
  }
}

async function callCompare(
  env: Env,
  before: string,
  after: string,
  detail: 'low' | 'high',
): Promise<unknown> {
  const input: OpenAIInput[] = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'BEFORE eating:' },
        { type: 'input_image', image_url: before, detail },
        { type: 'input_text', text: 'AFTER eating:' },
        { type: 'input_image', image_url: after, detail },
      ],
    },
  ];

  return callOpenAI(env, COMPARE_SYSTEM, input, COMPARE_SCHEMA);
}
