/**
 * Vision API service — handles image upload to R2 and vision job polling.
 * All OpenAI calls go through the Cloudflare Worker backend (never from app).
 */
import { ENV } from '../config/env';
import { getAccessToken, ensureAuth, refreshAuthSession, recreateAnonymousSession } from './authService';

const API = ENV.WORKER_API_URL;
const __DEV__ = process.env.NODE_ENV !== 'production';
let hasLoggedTokenDebug = false;

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

async function getBearerToken(): Promise<string> {
  let token = await getAccessToken();
  if (!token) {
    token = await ensureAuth();
  }
  if (!token) {
    throw new Error('Sign-in expired. Please try again.');
  }
  if (!isJwt(token)) {
    throw new Error('Auth token invalid');
  }
  if (__DEV__ && !hasLoggedTokenDebug) {
    console.log(`[Auth] token head=${token.slice(0, 12)} len=${token.length}`);
    hasLoggedTokenDebug = true;
  }
  return token;
}

async function fetchWithAuth(url: string, init: RequestInit, retryOn401 = true): Promise<Response> {
  const token = await getBearerToken();
  const baseHeaders = (init.headers || {}) as Record<string, string>;

  const makeInit = (bearer: string): RequestInit => ({
    ...init,
    headers: {
      ...baseHeaders,
      Authorization: `Bearer ${bearer}`,
      'x-eatlock-supabase-url': ENV.SUPABASE_URL,
      'x-tadlock-supabase-url': ENV.SUPABASE_URL,
    },
  });

  let res = await fetch(url, makeInit(token));
  if (res.status === 401 && retryOn401) {
    let refreshed = await refreshAuthSession();
    if (!refreshed) {
      try {
        refreshed = await recreateAnonymousSession();
      } catch {
        refreshed = null;
      }
    }
    if (!refreshed) {
      throw new Error('Sign-in expired. Please try again.');
    }
    res = await fetch(url, makeInit(refreshed));
  }

  return res;
}

// ── Types ─────────────────────────────

export type VisionStage = 'START_SCAN' | 'END_SCAN';

export type VisionVerdict =
  | 'FOOD_OK'
  | 'NOT_FOOD'
  | 'UNCLEAR'
  | 'CHEATING'
  | 'FINISHED'
  | 'NOT_FINISHED';

export interface VisionResult {
  verdict: VisionVerdict;
  confidence: number;
  finished_score: number | null;
  reason: string;
  roast: string;
  signals: Record<string, unknown>;
}

export interface VisionJobStatus {
  job_id: string;
  stage: VisionStage;
  status: 'queued' | 'processing' | 'done' | 'failed';
  error: string | null;
  result: VisionResult | null;
  created_at: string;
  updated_at: string;
}

// ── Upload ────────────────────────────

export async function getSignedUploadUrl(stage: string): Promise<{ r2_key: string; upload_url: string }> {
  const res = await fetchWithAuth(`${API}/v1/r2/signed-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, content_type: 'image/jpeg' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload URL failed' }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ r2_key: string; upload_url: string }>;
}

export async function uploadImageToR2(uploadUrl: string, imageUri: string): Promise<void> {
  // Read file as blob
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const uploadRes = await fetchWithAuth(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
  }
}

// ── Enqueue ───────────────────────────

export async function enqueueVisionJob(
  stage: VisionStage,
  r2Keys: Record<string, string>,
  sessionId?: string
): Promise<string> {
  const res = await fetchWithAuth(`${API}/v1/vision/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stage,
      r2_keys: r2Keys,
      session_id: sessionId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Enqueue failed' }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }

  const data = await res.json() as { job_id: string };
  return data.job_id;
}

// ── Polling ───────────────────────────

export async function getVisionJobStatus(jobId: string): Promise<VisionJobStatus> {
  const res = await fetchWithAuth(`${API}/v1/vision/job/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fetch job failed' }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<VisionJobStatus>;
}

/**
 * Poll a vision job until it reaches a terminal state (done or failed).
 * Returns the final job status.
 */
export async function pollVisionJob(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<VisionJobStatus> {
  const interval = opts?.intervalMs ?? 1500;
  const timeout = opts?.timeoutMs ?? 30000;
  const startTime = Date.now();

  while (true) {
    const job = await getVisionJobStatus(jobId);

    if (job.status === 'done' || job.status === 'failed') {
      return job;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error('Vision job timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ── Convenience: full scan flow ───────

/**
 * Upload image → enqueue vision job → poll until done → return result.
 * Used for both START_SCAN and END_SCAN.
 */
export async function runVisionScan(
  imageUri: string,
  stage: VisionStage,
  sessionId?: string,
  /** For END_SCAN, include the before image R2 key */
  beforeR2Key?: string
): Promise<VisionJobStatus> {
  // 1. Get upload URL
  const stageLabel = stage === 'START_SCAN' ? 'before' : 'after';
  const { r2_key, upload_url } = await getSignedUploadUrl(stageLabel);

  // 2. Upload image
  await uploadImageToR2(upload_url, imageUri);

  // 3. Build r2_keys map
  let r2Keys: Record<string, string>;
  if (stage === 'END_SCAN' && beforeR2Key) {
    r2Keys = { before: beforeR2Key, after: r2_key };
  } else {
    r2Keys = { image: r2_key };
  }

  // 4. Enqueue
  const jobId = await enqueueVisionJob(stage, r2Keys, sessionId);

  // 5. Poll
  return pollVisionJob(jobId);
}
