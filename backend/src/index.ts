/**
 * EatLock Cloudflare Worker — main entry point.
 *
 * Endpoints:
 *   POST /v1/r2/signed-upload        → returns signed upload URL + r2_key
 *   POST /v1/vision/enqueue          → creates vision_jobs row + enqueues message
 *   GET  /v1/vision/job/:job_id      → returns job status + result if done
 *
 * Queue consumer bound to eatlock-vision queue.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { handleVisionQueue, QueueMessage } from './queue/consumer';
import { handleVerifyFood, handleCompareMeal } from './vision';
import { handleNutritionEstimate } from './nutrition';

export interface Env {
  IMAGES: R2Bucket;
  VISION_QUEUE: Queue<QueueMessage>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OPENAI_API_KEY: string;
}

const MINUTE_MS = 60 * 1000;
const SHORT_WINDOW_MS = 2 * MINUTE_MS;
const signedUploadHits = new Map<string, number[]>();
const directUploadHits = new Map<string, number[]>();

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

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
}

function checkWindowLimit(
  bucket: Map<string, number[]>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const list = bucket.get(key) || [];
  const recent = list.filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    bucket.set(key, recent);
    return false;
  }
  recent.push(now);
  bucket.set(key, recent);
  return true;
}

async function getUser(
  request: Request,
  supabase: SupabaseClient
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.slice(7);
  const { data, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !data.user) {
    return error('Invalid or expired token', 401);
  }
  return { user_id: data.user.id };
}

// ── Routes ───────────────────────────────────

async function handleSignedUpload(
  request: Request,
  env: Env,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, supabase);
  if (auth instanceof Response) return auth;
  const ip = getClientIp(request);

  const userAllowed = checkWindowLimit(signedUploadHits, `signed:user:${auth.user_id}`, 18, SHORT_WINDOW_MS);
  const ipAllowed = checkWindowLimit(signedUploadHits, `signed:ip:${ip}`, 40, SHORT_WINDOW_MS);
  if (!userAllowed || !ipAllowed) {
    return error('Too many upload requests. Please wait and try again.', 429);
  }

  const body = await request.json() as { kind?: string };
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
  const auth = await getUser(request, supabase);
  if (auth instanceof Response) return auth;
  const ip = getClientIp(request);

  const userAllowed = checkWindowLimit(directUploadHits, `upload:user:${auth.user_id}`, 16, SHORT_WINDOW_MS);
  const ipAllowed = checkWindowLimit(directUploadHits, `upload:ip:${ip}`, 36, SHORT_WINDOW_MS);
  if (!userAllowed || !ipAllowed) {
    return error('Upload rate limited. Please slow down and retry.', 429);
  }

  // Verify the key belongs to this user
  if (!r2Key.includes(auth.user_id)) {
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
  const auth = await getUser(request, supabase);
  if (auth instanceof Response) return auth;

  const body = await request.json() as {
    session_id?: string;
    stage: 'START_SCAN' | 'END_SCAN';
    r2_keys: Record<string, string>;
  };

  if (!body.stage || !body.r2_keys || Object.keys(body.r2_keys).length === 0) {
    return error('Missing stage or r2_keys');
  }

  // Validate r2_keys belong to user
  for (const key of Object.values(body.r2_keys)) {
    if (!key.includes(auth.user_id)) {
      return error('r2_key does not belong to user', 403);
    }
  }

  // Create vision_jobs row
  const { data: job, error: dbErr } = await supabase
    .from('vision_jobs')
    .insert({
      user_id: auth.user_id,
      session_id: body.session_id || null,
      stage: body.stage,
      r2_keys: body.r2_keys,
      status: 'queued',
    })
    .select('id')
    .single();

  if (dbErr || !job) {
    return error(`Failed to create job: ${dbErr?.message}`, 500);
  }

  // Enqueue message
  const queueMsg: QueueMessage = {
    job_id: job.id,
    user_id: auth.user_id,
    stage: body.stage,
    r2_keys: body.r2_keys,
  };

  await env.VISION_QUEUE.send(queueMsg);

  return json({ job_id: job.id, status: 'queued' }, 201);
}

async function handleGetJob(
  request: Request,
  env: Env,
  jobId: string,
  supabase: SupabaseClient
): Promise<Response> {
  const auth = await getUser(request, supabase);
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

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const requestId = crypto.randomUUID();

    const finalize = (response: Response): Response => {
      const headers = new Headers(response.headers);
      headers.set('x-request-id', requestId);
      headers.set('Access-Control-Allow-Origin', '*');
      const safeResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      console.log(`[req:${requestId}] ${method} ${path} -> ${safeResponse.status}`);
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
        return finalize(await handleVerifyFood(request, env, supabase));
      }

      // POST /v1/vision/compare-meal (auth required, r2Key-based)
      if (method === 'POST' && path === '/v1/vision/compare-meal') {
        return finalize(await handleCompareMeal(request, env, supabase));
      }

      // POST /v1/nutrition/estimate
      if (method === 'POST' && path === '/v1/nutrition/estimate') {
        return finalize(await handleNutritionEstimate(request, env, supabase));
      }

      // POST /v1/nutrition/estimate (auth required, r2Key-based)
      if (method === 'POST' && path === '/v1/nutrition/estimate') {
        return await handleNutritionEstimate(request, env, supabase);
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
        return finalize(json({ status: 'ok', service: 'eatlock-worker' }));
      }

      return finalize(error('Not found', 404));
    } catch (err: any) {
      console.error(`[req:${requestId}] Unhandled error on ${method} ${path}`);
      return finalize(error(`Internal error: ${err.message}`, 500));
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
    } catch (err) {
      console.error('[R2 Cleanup] Error during cleanup:', err);
    }
  },
};
