/**
 * Vision API service — handles image upload to R2 and vision job polling.
 * All OpenAI calls go through the Cloudflare Worker backend (never from app).
 */
import { ENV } from '../config/env';
import { getAccessToken } from './authService';

const API = ENV.WORKER_API_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
  const headers = await authHeaders();
  const res = await fetch(`${API}/v1/r2/signed-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ stage, content_type: 'image/jpeg' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload URL failed' }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ r2_key: string; upload_url: string }>;
}

export async function uploadImageToR2(uploadUrl: string, imageUri: string): Promise<void> {
  const token = await getAccessToken();

  // Read file as blob
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const headers = await authHeaders();
  const res = await fetch(`${API}/v1/vision/enqueue`, {
    method: 'POST',
    headers,
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
  const headers = await authHeaders();
  const res = await fetch(`${API}/v1/vision/job/${jobId}`, {
    method: 'GET',
    headers,
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
