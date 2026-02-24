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
 * Rate-limited per user_id:  30 verify/day, 10 compare/day.
 * Max image size: 5 MB per object.
 */

import type { Env } from './index';

// ── Constants ────────────────────────────────

const MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const OPENAI_API = 'https://api.openai.com/v1/responses';

// Rate-limit windows (per user_id, in-memory — resets on cold start, OK for v1)
const VERIFY_LIMIT = 30;
const COMPARE_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h
const SHORT_WINDOW_MS = 60 * 1000;
const VERIFY_BURST_LIMIT = 8;
const COMPARE_BURST_LIMIT = 6;
const CONCURRENT_WINDOW_MS = 60 * 1000;
const CONCURRENT_LIMIT = 3;
const NOT_FOOD_WINDOW_MS = 10 * 60 * 1000;
const NOT_FOOD_LIMIT = 10;
const NOT_FOOD_COOLDOWN_MS = 5 * 60 * 1000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const burstBuckets = new Map<string, number[]>();
const activeOpBuckets = new Map<string, number[]>();
const failedScanBuckets = new Map<string, number[]>();
const failedCooldownBuckets = new Map<string, number>();

function checkRate(key: string, limit: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) return { ok: false, remaining: 0 };
  bucket.count++;
  return { ok: true, remaining: limit - bucket.count };
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

function checkConcurrent(key: string): boolean {
  const now = Date.now();
  const current = (activeOpBuckets.get(key) || []).filter((ts) => now - ts < CONCURRENT_WINDOW_MS);
  if (current.length >= CONCURRENT_LIMIT) {
    activeOpBuckets.set(key, current);
    return false;
  }
  current.push(now);
  activeOpBuckets.set(key, current);
  return true;
}

function markFailedScan(key: string): void {
  const now = Date.now();
  const current = (failedScanBuckets.get(key) || []).filter((ts) => now - ts < NOT_FOOD_WINDOW_MS);
  current.push(now);
  failedScanBuckets.set(key, current);
  if (current.length >= NOT_FOOD_LIMIT) {
    failedCooldownBuckets.set(key, now + NOT_FOOD_COOLDOWN_MS);
  }
}

function isInFailedCooldown(key: string): boolean {
  const now = Date.now();
  const until = failedCooldownBuckets.get(key);
  if (!until) return false;
  if (now > until) {
    failedCooldownBuckets.delete(key);
    return false;
  }
  return true;
}

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

const VERIFY_SYSTEM = `You are EatLock's strict meal-photo verifier.
Given a single photo, determine whether it shows REAL food on a plate/bowl that someone is about to eat.
Be harsh: reject selfies, fingers covering the lens, screenshots, dark/blurry shots, and non-food objects.
Write a short witty roastLine (max 18 words, include 1-2 emojis). If rejected, provide a helpful retakeHint (max 15 words).
If accepted (isFood=true), set reasonCode to "OK", roastLine to a compliment, and retakeHint to empty string.
quality.brightness/blur/framing are 0-1 scores (1 = perfect).
Confidence is 0-1.`;

const COMPARE_SYSTEM = `You are EatLock's before/after meal comparison AI.
You receive two photos: BEFORE eating (first) and AFTER eating (second).
Determine how much food was consumed.

Rules:
- EATEN: plate is clearly emptier (foodChangeScore > 0.75)
- PARTIAL: some food gone but visible leftovers (0.25 < foodChangeScore <= 0.75)
- UNCHANGED: food looks the same as before (foodChangeScore <= 0.25)
- UNVERIFIABLE: can't tell (different angle, lighting, blurry, or photos don't match)
- duplicateScore: 0 = completely different, 1 = identical (detect duplicate/resubmitted photos)
- If duplicateScore > 0.9 -> reasonCode = "DUPLICATE_AFTER"
- foodChangeScore: 0 = no change, 1 = all food gone
- isSameScene: are both photos from the same table/setting?

Write a short witty roastLine (max 18 words, include 1-2 emojis). Provide retakeHint when UNVERIFIABLE.
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
  const body = {
    model: MODEL,
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
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    output: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
  };

  const msgOutput = data.output?.find((o: any) => o.type === 'message');
  const textContent = msgOutput?.content?.find((c: any) => c.type === 'output_text');
  if (!textContent?.text) {
    throw new Error('No text in OpenAI response');
  }

  return JSON.parse(textContent.text);
}

// ── Route Handlers ───────────────────────────

export async function handleVerifyFood(
  request: Request,
  env: Env,
): Promise<Response> {
  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  if (isInFailedCooldown(`failed:${auth.user_id}`)) {
    return err('Too many failed scans, try again in 5 minutes.', 429);
  }

  if (!checkConcurrent(`active:${auth.user_id}`)) {
    return err('Too many active scan requests. Please wait a moment.', 429);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const burstUserOk = checkBurst(`verify:user:${auth.user_id}`, VERIFY_BURST_LIMIT, SHORT_WINDOW_MS);
  const burstIpOk = checkBurst(`verify:ip:${ip}`, VERIFY_BURST_LIMIT * 2, SHORT_WINDOW_MS);
  if (!burstUserOk || !burstIpOk) {
    return err('Too many verify requests. Please slow down.', 429);
  }

  // Rate limit (per user)
  const rate = checkRate(`verify:${auth.user_id}`, VERIFY_LIMIT);
  if (!rate.ok) {
    return err('Rate limit exceeded (30 verify/day)', 429, { remaining: 0 });
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
  if (!body.r2Key.includes(auth.user_id)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    // Download from R2
    const dataUrl = await r2ToDataUrl(env.IMAGES, body.r2Key);
    if (!dataUrl) {
      return err('Image not found in R2 (expired or invalid key)', 404);
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

    const typed = result as { isFood?: boolean };
    if (typed?.isFood === false) {
      markFailedScan(`failed:${auth.user_id}`);
    }

    // Do NOT delete the R2 object here — it may be needed for compare-meal later.
    return json(result);
  } catch (e: any) {
    if (e.status === 413) return err(e.message, 413);
    console.error('[verify-food]', e);
    return err(`Vision error: ${e.message}`, 502);
  }
}

export async function handleCompareMeal(
  request: Request,
  env: Env,
): Promise<Response> {
  // Auth
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  if (!checkConcurrent(`active:${auth.user_id}`)) {
    return err('Too many active scan requests. Please wait a moment.', 429);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const burstUserOk = checkBurst(`compare:user:${auth.user_id}`, COMPARE_BURST_LIMIT, SHORT_WINDOW_MS);
  const burstIpOk = checkBurst(`compare:ip:${ip}`, COMPARE_BURST_LIMIT * 2, SHORT_WINDOW_MS);
  if (!burstUserOk || !burstIpOk) {
    return err('Too many compare requests. Please slow down.', 429);
  }

  // Rate limit (per user)
  const rate = checkRate(`compare:${auth.user_id}`, COMPARE_LIMIT);
  if (!rate.ok) {
    return err('Rate limit exceeded (10 compare/day)', 429, { remaining: 0 });
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
  if (!body.preKey.includes(auth.user_id) || !body.postKey.includes(auth.user_id)) {
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
    return err(`Vision error: ${e.message}`, 502);
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
