import { ownsR2Key } from './utils/ownership';

/**
 * TadLock Cloudflare Worker — main entry point.
 *
 * Endpoints:
 *   POST /v1/r2/signed-upload        → returns signed upload URL + r2_key
 *   POST /v1/vision/enqueue          → creates vision_jobs row + enqueues message
 *   GET  /v1/vision/job/:job_id      → returns job status + result if done
 *
 * Queue consumer bound to tadlock-vision queue.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { handleVisionQueue, QueueMessage } from './queue/consumer';
import { handleVerifyFood, handleCompareMeal } from './vision';
import { handleNutritionEstimate } from './nutrition';
import { handleBarcodeLookup } from './barcode';
import { handleEnrichMicros } from './enrich_micros';
import { handleUpdateFoodLabel } from './food_label';
import { handleDeleteAccount } from './account';
import {
  acquireConcurrencySlot,
  consumeRateLimit,
  consumeVisionQuota,
  dailyLimitsDisabled,
  limitsEnforced,
  releaseConcurrencySlot,
  secondsUntilUtcMidnight,
  serviceKey,
  toLimit,
} from './limits';
import { validateVisionQueuePayload } from './visionPayload';

export interface Env {
  IMAGES: R2Bucket;
  VISION_QUEUE: Queue<QueueMessage>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_SERVICE_KEY?: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  DISABLE_DAILY_LIMITS?: string;
  VERIFY_DAILY_LIMIT?: string;
  COMPARE_DAILY_LIMIT?: string;
  NUTRITION_DAILY_LIMIT?: string;
  ENFORCE_LIMITS?: string;
  ALLOWED_ORIGINS?: string;
}

const UPLOAD_WINDOW_SECONDS = 2 * 60;
const VISION_WINDOW_SECONDS = 60;
const VISION_ACTIVE_TTL_SECONDS = 10 * 60;

// ── Helpers ──────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function parseCsvSet(raw?: string): Set<string> {
  return new Set((raw || '').split(',').map((v) => v.trim()).filter(Boolean));
}

function resolveCorsOrigin(request: Request, env: Env): string {
  const allowed = parseCsvSet(env.ALLOWED_ORIGINS);
  if (allowed.size === 0) return 'null';
  if (allowed.has('*')) return '*';

  const requestOrigin = request.headers.get('Origin');
  if (requestOrigin && allowed.has(requestOrigin)) {
    return requestOrigin;
  }
  return 'null';
}

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
}

function sanitizePathForLogs(path: string): string {
  if (path.startsWith('/v1/r2/upload/')) {
    return '/v1/r2/upload/[redacted]';
  }
  return path
    .replace(/^\/v1\/vision\/job\/[a-f0-9-]+$/i, '/v1/vision/job/[id]')
    .replace(/^\/v1\/meals\/[a-f0-9-]{36}(\/.*)$/i, '/v1/meals/[id]$1');
}

async function getUser(
  request: Request,
  env: Env,
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error('Missing or invalid Authorization header', 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (jwt.split('.').length !== 3) {
    return error('Invalid or expired token', 401);
  }

  const whoamiRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (whoamiRes.status === 401) {
    return error('Invalid or expired token', 401);
  }
  if (!whoamiRes.ok) {
    return error('Invalid or expired token', 401);
  }

  const whoami = (await whoamiRes.json().catch(() => null)) as { id?: string } | null;
  if (!whoami?.id) {
    return error('Invalid or expired token', 401);
  }

  return { user_id: whoami.id };
}

// ── Routes ───────────────────────────────────

async function handleSignedUpload(
  request: Request,
  env: Env,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const ip = getClientIp(request);
  const enforce = limitsEnforced(env);

  if (enforce) {
    const userAllowed = await consumeRateLimit(env, `upload:signed:user:${auth.user_id}`, 18, UPLOAD_WINDOW_SECONDS);
    if (!userAllowed.allowed) {
      return error('Too many upload requests. Please wait and try again.', 429);
    }

    const ipAllowed = await consumeRateLimit(env, `upload:signed:ip:${ip}`, 40, UPLOAD_WINDOW_SECONDS);
    if (!ipAllowed.allowed) {
      return error('Too many upload requests. Please wait and try again.', 429);
    }
  }

  let body: { kind?: string };
  try {
    body = await request.json() as { kind?: string };
  } catch {
    return error('Invalid JSON body');
  }
  const kind = body.kind === 'after' ? 'after' : 'before';

  // Generate unique R2 key
  const r2Key = `uploads/${auth.user_id}/${Date.now()}_${kind}_${crypto.randomUUID().slice(0, 8)}.jpg`;

  const origin = new URL(request.url).origin;

  return json({
    uploadUrl: `${origin}/v1/r2/upload/${r2Key}`,
    r2Key,
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    expiresInSeconds: 600,
  });
}

async function handleDirectUpload(
  request: Request,
  env: Env,
  r2Key: string,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;
  const ip = getClientIp(request);
  const enforce = limitsEnforced(env);

  if (enforce) {
    const userAllowed = await consumeRateLimit(env, `upload:direct:user:${auth.user_id}`, 16, UPLOAD_WINDOW_SECONDS);
    if (!userAllowed.allowed) {
      return error('Upload rate limited. Please slow down and retry.', 429);
    }

    const ipAllowed = await consumeRateLimit(env, `upload:direct:ip:${ip}`, 36, UPLOAD_WINDOW_SECONDS);
    if (!ipAllowed.allowed) {
      return error('Upload rate limited. Please slow down and retry.', 429);
    }
  }

  // Verify the key belongs to this user
  if (!ownsR2Key(auth.user_id, r2Key)) {
    return error('Forbidden', 403);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase().split(';')[0] || '';
  if (contentType !== 'image/jpeg') {
    return error('Only image/jpeg uploads are allowed', 415);
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return error('Invalid content-length header', 400);
    }
    if (contentLength > 5 * 1024 * 1024) {
      return error('Image too large (max 5MB)', 413);
    }
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return error('Empty body');
  }
  if (body.byteLength > 5 * 1024 * 1024) {
    return error('Image too large (max 5MB)', 413);
  }

  await env.IMAGES.put(r2Key, body, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { user_id: auth.user_id, uploaded_at: new Date().toISOString() },
  });

  return json({ ok: true, r2_key: r2Key });
}

async function handleEnqueueVision(
  request: Request,
  env: Env,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return error('Invalid JSON body');
  }

  const validated = validateVisionQueuePayload(rawBody);
  if (!validated.ok) {
    return error(validated.error, validated.status);
  }

  const { quotaKind, r2Keys, sessionId, stage } = validated.value;

  // Validate r2_keys belong to user
  for (const key of Object.values(r2Keys)) {
    if (!ownsR2Key(auth.user_id, key as string)) {
      return error('r2_key does not belong to user', 403);
    }
  }

  const enforce = limitsEnforced(env);
  const ip = getClientIp(request);
  const burstLimit = quotaKind === 'verify' ? 10 : 6;
  const burstError = quotaKind === 'verify'
    ? 'Too many requests. Please slow down.'
    : 'Too many compare requests. Please slow down.';
  const dailyLimit = quotaKind === 'verify'
    ? toLimit(env.VERIFY_DAILY_LIMIT, 1000)
    : toLimit(env.COMPARE_DAILY_LIMIT, 300);
  const activeBucket = `vision:${quotaKind}:active:${auth.user_id}`;
  let slotId: string | null = null;

  if (enforce) {
    const burstUserOk = await consumeRateLimit(
      env,
      `vision:${quotaKind}:user:${auth.user_id}`,
      burstLimit,
      VISION_WINDOW_SECONDS,
    );
    if (!burstUserOk.allowed) {
      return error(burstError, 429);
    }

    const burstIpOk = await consumeRateLimit(
      env,
      `vision:${quotaKind}:ip:${ip}`,
      burstLimit * 2,
      VISION_WINDOW_SECONDS,
    );
    if (!burstIpOk.allowed) {
      return error(burstError, 429);
    }

    const slot = await acquireConcurrencySlot(env, activeBucket, 3, VISION_ACTIVE_TTL_SECONDS);
    if (!slot.allowed) {
      return error('Too many active scan requests. Please wait a moment.', 429);
    }
    slotId = slot.slot_id;

    if (!dailyLimitsDisabled(env)) {
      const quota = await consumeVisionQuota(env, auth.user_id, quotaKind, dailyLimit);
      if (!quota.allowed) {
        await releaseConcurrencySlot(env, activeBucket, slotId);
        return json({
          error: 'Daily limit reached',
          kind: quotaKind,
          limit: dailyLimit,
          remaining: 0,
          reset_in_seconds: secondsUntilUtcMidnight(),
        }, 429);
      }
    }
  }

  // Create vision_jobs row
  const { data: job, error: dbErr } = await supabase
    .from('vision_jobs')
    .insert({
      user_id: auth.user_id,
      session_id: sessionId,
      stage,
      r2_keys: r2Keys,
      status: 'queued',
    })
    .select('id')
    .single();

  if (dbErr || !job) {
    await releaseConcurrencySlot(env, activeBucket, slotId);
    console.error('[vision/enqueue] Failed to create job', dbErr?.message || dbErr);
    return error('Failed to create vision job', 500);
  }

  // Enqueue message
  const queueMsg: QueueMessage = {
    job_id: job.id,
    user_id: auth.user_id,
    stage,
    r2_keys: r2Keys,
    rate_limit_slot_id: slotId || undefined,
  };

  try {
    await env.VISION_QUEUE.send(queueMsg);
  } catch (queueError) {
    await releaseConcurrencySlot(env, activeBucket, slotId);
    await supabase
      .from('vision_jobs')
      .update({ status: 'failed', error: 'Failed to enqueue vision job', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .then(() => {}, () => {});
    console.error('[vision/enqueue] Queue send failed', queueError);
    return error('Failed to enqueue vision job', 500);
  }

  return json({ job_id: job.id, status: 'queued' }, 201);
}

async function handleGetJob(
  request: Request,
  env: Env,
  jobId: string,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  const { data: job, error: dbErr } = await supabase
    .from('vision_jobs')
    .select('id, stage, status, error, created_at, updated_at, result_id')
    .eq('id', jobId)
    .eq('user_id', auth.user_id)
    .single();

  if (dbErr || !job) {
    return error('Job not found', 404);
  }

  let result = null;
  if (job.result_id) {
    const { data: res } = await supabase
      .from('vision_results')
      .select('verdict, confidence, finished_score, reason, roast, signals')
      .eq('id', job.result_id)
      .single();
    result = res;
  }

  return json({
    job_id: job.id,
    stage: job.stage,
    status: job.status,
    error: job.error,
    result,
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
}

// ── Main Fetch Handler ───────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const corsOrigin = resolveCorsOrigin(request, env);

    // CORS
    if (method === 'OPTIONS') {
      const optionsHeaders = new Headers({
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      });
      if (corsOrigin !== '*') {
        optionsHeaders.set('Vary', 'Origin');
      }
      return new Response(null, {
        headers: optionsHeaders,
      });
    }

    const supabase = createClient(env.SUPABASE_URL, serviceKey(env), {
      auth: { persistSession: false },
    });
    const requestId = crypto.randomUUID();
    const logPath = sanitizePathForLogs(path);

    const finalize = (response: Response): Response => {
      const headers = new Headers(response.headers);
      headers.set('x-request-id', requestId);
      headers.set('Access-Control-Allow-Origin', corsOrigin);
      if (corsOrigin !== '*') {
        headers.set('Vary', 'Origin');
      }
      const safeResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      console.log(`[req:${requestId}] ${method} ${logPath} -> ${safeResponse.status}`);
      return safeResponse;
    };

    try {
      // POST /v1/r2/signed-upload
      if (method === 'POST' && path === '/v1/r2/signed-upload') {
        return finalize(await handleSignedUpload(request, env, supabase));
      }

      // PUT /v1/r2/upload/:r2_key (direct upload proxy)
      if (method === 'PUT' && path.startsWith('/v1/r2/upload/')) {
        const r2Key = decodeURIComponent(path.slice('/v1/r2/upload/'.length));
        return finalize(await handleDirectUpload(request, env, r2Key, supabase));
      }

      // POST /v1/vision/verify-food (auth required, r2Key-based)
      if (method === 'POST' && path === '/v1/vision/verify-food') {
        return finalize(await handleVerifyFood(request, env));
      }

      // POST /v1/vision/compare-meal (auth required, r2Key-based)
      if (method === 'POST' && path === '/v1/vision/compare-meal') {
        return finalize(await handleCompareMeal(request, env));
      }

      // POST /v1/nutrition/estimate
      if (method === 'POST' && path === '/v1/nutrition/estimate') {
        return finalize(await handleNutritionEstimate(request, env));
      }

      // POST /v1/barcode/lookup
      if (method === 'POST' && path === '/v1/barcode/lookup') {
        return finalize(await handleBarcodeLookup(request, env));
      }

      // POST /v1/meals/:mealId/enrich_micros
      const enrichMatch = path.match(/^\/v1\/meals\/([a-f0-9-]{36})\/enrich_micros$/);
      if (method === 'POST' && enrichMatch) {
        return finalize(await handleEnrichMicros(request, env, enrichMatch[1]));
      }

      // PUT /v1/meals/:mealId/food_label
      const foodLabelMatch = path.match(/^\/v1\/meals\/([a-f0-9-]{36})\/food_label$/);
      if (method === 'PUT' && foodLabelMatch) {
        return finalize(await handleUpdateFoodLabel(request, env, foodLabelMatch[1]));
      }

      // DELETE /v1/account
      if (method === 'DELETE' && path === '/v1/account') {
        return finalize(await handleDeleteAccount(request, env));
      }

      // POST /v1/vision/enqueue
      if (method === 'POST' && path === '/v1/vision/enqueue') {
        return finalize(await handleEnqueueVision(request, env, supabase));
      }

      // GET /v1/vision/job/:job_id
      const jobMatch = path.match(/^\/v1\/vision\/job\/([a-f0-9-]+)$/);
      if (method === 'GET' && jobMatch) {
        return finalize(await handleGetJob(request, env, jobMatch[1], supabase));
      }

      // Health check
      if (method === 'GET' && (path === '/' || path === '/health')) {
        return finalize(json({ status: 'ok', service: 'tadlock-worker' }));
      }

      return finalize(error('Not found', 404));
    } catch (err: any) {
      console.error(`[req:${requestId}] Unhandled error on ${method} ${logPath}`);
      return finalize(error('Internal server error', 500));
    }
  },

  // Queue consumer
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    await handleVisionQueue(batch, env as any);
  },

  // Cron-triggered R2 cleanup — delete temp uploads older than 30 minutes
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const TTL_MS = 30 * 60 * 1000; // 30 minutes
    const cutoff = Date.now() - TTL_MS;
    let cursor: string | undefined;
    let deletedCount = 0;

    try {
      do {
        const listed = await env.IMAGES.list({ prefix: 'uploads/', cursor, limit: 500 });
        for (const obj of listed.objects) {
          // R2 objects have an `uploaded` timestamp
          if (obj.uploaded.getTime() < cutoff) {
            await env.IMAGES.delete(obj.key);
            deletedCount++;
          }
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      console.log(`[R2 Cleanup] Deleted ${deletedCount} stale uploads.`);

      const supabase = createClient(env.SUPABASE_URL, serviceKey(env), {
        auth: { persistSession: false },
      });
      const nowIso = new Date().toISOString();
      const staleWindowsIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      await Promise.allSettled([
        supabase.from('request_limit_windows').delete().lt('updated_at', staleWindowsIso),
        supabase.from('request_active_slots').delete().lt('expires_at', nowIso),
        supabase.from('request_cooldowns').delete().lt('cooldown_until', nowIso),
      ]);
    } catch (err) {
      console.error('[R2 Cleanup] Error during cleanup:', err);
    }
  },
};
