/**
 * CloudVisionService — R2 signed-upload flow.
 *
 * 1. Compress image on-device (768px JPEG 0.65)
 * 2. POST /v1/r2/signed-upload  → get { uploadUrl, r2Key }
 * 3. PUT binary to uploadUrl     → image lands in R2
 * 4. POST /v1/vision/verify-food or /compare-meal with r2Key(s)
 *
 * All requests carry a Supabase Bearer token.
 * No OpenAI API key ever leaves the backend.
 */

import type { MealVisionService } from './MealVisionService';
import type { FoodCheckResult, CompareResult, NutritionEstimate } from './types';
import { compressImage } from './imageCompress';
import { getAccessToken, ensureAuth, refreshAuthSession, recreateAnonymousSession } from '../authService';
import { ENV } from '../../config/env';

const API = ENV.WORKER_API_URL;

/** Timeout for each backend call (ms) */
const REQUEST_TIMEOUT = 45_000; // Raised: upload + vision can take a while

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
    },
  });

  let res = await fetch(url, makeInit(token));

  if (res.status === 401 && retryOn401) {
    if (__DEV__) console.warn(`[Vision] 401 on ${url} — refreshing token and retrying once`);
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

// ── Generic JSON POST ────────────────────────

async function postJSON<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const url = `${API}${endpoint}`;

  if (__DEV__) console.log(`[Vision] POST ${url}`, JSON.stringify(body).slice(0, 120));

  try {
    const res = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (__DEV__) console.log(`[Vision] ${endpoint} → ${res.status}`);

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sign-in expired. Please try again.');
      }
      const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const errMsg = (errBody.error as string) || `HTTP ${res.status}`;
      if (__DEV__) console.error(`[Vision] ${endpoint} ERROR:`, errMsg);
      throw new Error(errMsg);
    }

    const data = (await res.json()) as T;
    if (__DEV__) console.log(`[Vision] ${endpoint} OK:`, JSON.stringify(data).slice(0, 200));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── Signed-upload flow ───────────────────────

interface SignedUploadResponse {
  uploadUrl: string;
  r2Key: string;
  method: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Compress an image, request a signed upload URL, and PUT the binary to R2.
 * Returns the r2Key for subsequent vision calls.
 */
async function uploadToR2(imageUri: string, kind: 'before' | 'after'): Promise<string> {
  // 1. Compress
  if (__DEV__) console.log(`[Vision] Compressing ${kind} image…`);
  const { buffer } = await compressImage(imageUri);
  if (__DEV__) console.log(`[Vision] Compressed → ${(buffer.byteLength / 1024).toFixed(1)} KB`);

  // 2. Request signed upload URL
  const signed = await postJSON<SignedUploadResponse>(
    '/v1/r2/signed-upload',
    { kind },
  );
  if (__DEV__) console.log(`[Vision] Signed URL → ${signed.uploadUrl.slice(0, 80)}…`);

  // 3. PUT binary to R2 via the worker proxy
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const putRes = await fetchWithAuth(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: buffer,
      signal: controller.signal,
    });

    if (__DEV__) console.log(`[Vision] R2 PUT → ${putRes.status}`);

    if (!putRes.ok) {
      if (putRes.status === 401) {
        throw new Error('Sign-in expired. Please try again.');
      }
      const text = await putRes.text().catch(() => '');
      throw new Error(`R2 upload failed: ${putRes.status} ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  if (__DEV__) console.log(`[Vision] Upload complete → ${signed.r2Key}`);
  return signed.r2Key;
}

// ── Service implementation ───────────────────

export class CloudVisionService implements MealVisionService {
  /** The r2Key from the most recent verifyFood upload. */
  private _lastR2Key: string | null = null;
  get lastR2Key(): string | null { return this._lastR2Key; }

  /** Upload image to R2, then call /verify-food with the r2Key. */
  async verifyFood(imageUri: string): Promise<FoodCheckResult> {
    const r2Key = await uploadToR2(imageUri, 'before');
    this._lastR2Key = r2Key;

    return postJSON<FoodCheckResult>(
      '/v1/vision/verify-food',
      { r2Key },
    );
  }

  /**
   * Upload the after image to R2, then call /compare-meal with both keys.
   * The preImageUri is the *original* (already uploaded during verifyFood),
   * but we accept it as a URI so the interface stays the same.
   *
   * If preImageUri looks like an r2Key (starts with "uploads/"), we reuse it.
   * Otherwise we upload it fresh as "before".
   */
  async compareMeal(preImageUri: string, postImageUri: string): Promise<CompareResult> {
    // Pre-image: if it's already an r2Key (passed from verify step), reuse it
    const preKey = preImageUri.startsWith('uploads/')
      ? preImageUri
      : await uploadToR2(preImageUri, 'before');

    // Post-image: always upload fresh
    const postKey = await uploadToR2(postImageUri, 'after');

    return postJSON<CompareResult>(
      '/v1/vision/compare-meal',
      { preKey, postKey },
    );
  }

  /** Estimate calories from a previously uploaded R2 image. */
  async estimateCalories(r2Key: string): Promise<NutritionEstimate | null> {
    try {
      const data = await postJSON<Omit<NutritionEstimate, 'source'>>(        '/v1/nutrition/estimate',
        { r2Key },
      );
      return { ...data, source: 'vision' };
    } catch (e: any) {
      if (__DEV__) console.warn('[Vision] estimateCalories failed:', e?.message);
      return null;
    }
  }
}
