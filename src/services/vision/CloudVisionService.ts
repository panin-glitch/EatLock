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
import type { FoodCheckResult, CompareResult } from './types';
import { compressImage } from './imageCompress';
import { getAccessToken } from '../authService';
import { ENV } from '../../config/env';

const API = ENV.WORKER_API_URL;

/** Timeout for each backend call (ms) */
const REQUEST_TIMEOUT = 45_000; // Raised: upload + vision can take a while

// ── Auth header helper ───────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated – please sign in again.');
  return { Authorization: `Bearer ${token}` };
}

// ── Generic JSON POST ────────────────────────

async function postJSON<T>(
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error((errBody.error as string) || `HTTP ${res.status}`);
    }

    return (await res.json()) as T;
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
  const auth = await authHeaders();

  // 1. Compress
  const { buffer } = await compressImage(imageUri);

  // 2. Request signed upload URL
  const signed = await postJSON<SignedUploadResponse>(
    '/v1/r2/signed-upload',
    { kind },
    auth,
  );

  // 3. PUT binary to R2 via the worker proxy
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const putRes = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', ...auth },
      body: buffer,
      signal: controller.signal,
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      throw new Error(`R2 upload failed: ${putRes.status} ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  return signed.r2Key;
}

// ── Service implementation ───────────────────

export class CloudVisionService implements MealVisionService {
  /** Upload image to R2, then call /verify-food with the r2Key. */
  async verifyFood(imageUri: string): Promise<FoodCheckResult> {
    const auth = await authHeaders();
    const r2Key = await uploadToR2(imageUri, 'before');

    return postJSON<FoodCheckResult>(
      '/v1/vision/verify-food',
      { r2Key },
      auth,
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
    const auth = await authHeaders();

    // Pre-image: if it's already an r2Key (passed from verify step), reuse it
    const preKey = preImageUri.startsWith('uploads/')
      ? preImageUri
      : await uploadToR2(preImageUri, 'before');

    // Post-image: always upload fresh
    const postKey = await uploadToR2(postImageUri, 'after');

    return postJSON<CompareResult>(
      '/v1/vision/compare-meal',
      { preKey, postKey },
      auth,
    );
  }
}
