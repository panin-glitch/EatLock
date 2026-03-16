/**
 * CloudVisionService — R2 signed-upload flow.
 */

import type { MealVisionService } from './MealVisionService';
import type { FoodCheckResult, CompareResult, NutritionEstimate, VisionSoftError } from './types';
import { compressImage } from './imageCompress';
import { fetchWithAuth as authenticatedFetch, isAuthRequiredError } from '../authFetch';
import { ENV } from '../../config/env';

const API = ENV.WORKER_API_URL;
const REQUEST_TIMEOUT = 45_000;

const __DEV__ = process.env.NODE_ENV !== 'production';
const DEBUG = __DEV__;

function isSoftError<T>(value: T | VisionSoftError): value is VisionSoftError {
  return (value as VisionSoftError)?.kind === 'soft_error';
}

function makeSoftError(code: VisionSoftError['code'], title: string, subtitle: string, extras?: Partial<VisionSoftError>): VisionSoftError {
  return {
    kind: 'soft_error',
    code,
    title,
    subtitle,
    ...extras,
  };
}

function normalizeServerErrorMessage(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (lower.includes('1101') || lower.includes('internal error') || lower.includes('cloudflare')) {
    return 'AI service is temporarily unavailable. Please try again in a moment.';
  }
  if (status >= 500) {
    return 'AI service is temporarily unavailable. Please try again in a moment.';
  }
  return message;
}

async function postJSON<T>(endpoint: string, body: Record<string, unknown>): Promise<T | VisionSoftError> {
  const url = `${API}${endpoint}`;
  const maxAttempts = 3;
  const retryDelayMs = [250, 700, 1400];

  if (DEBUG) console.log(`[Vision] POST ${endpoint}`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      let res: Response;
      try {
        res = await authenticatedFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (networkErr: any) {
        if (isAuthRequiredError(networkErr)) {
          return makeSoftError('SESSION_EXPIRED', 'Session expired', 'Please sign in again.');
        }
        if (DEBUG) {
          console.log('[Vision] network issue', {
            endpoint,
            message: networkErr?.message,
            attempt: attempt + 1,
          });
        }
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
          continue;
        }
        return makeSoftError('NETWORK', 'Connection issue', 'Could not reach the server. Check your connection and try again.');
      }

      if (DEBUG) console.log(`[Vision] ${endpoint} → ${res.status}`);

      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let errBody: Record<string, unknown> = {};
        try {
          errBody = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          errBody = {};
        }

        if (res.status === 401) {
          return makeSoftError('SESSION_EXPIRED', 'Session expired', 'Please sign in again.');
        }

        const errMsg =
          (errBody.error as string) ||
          (errBody.message as string) ||
          (raw ? raw.slice(0, 220) : `HTTP ${res.status}`);
        const normalizedErrMsg = normalizeServerErrorMessage(errMsg || '', res.status);
        const transient = res.status >= 500 || res.status === 429 || normalizedErrMsg.toLowerCase().includes('1101');

        if (transient && attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs[attempt] ?? 1400));
          continue;
        }

        if (res.status === 429) {
          const retryAfter = Number(errBody.retry_after_seconds ?? 30);
          const resetInSeconds = Number(errBody.reset_in_seconds ?? 0);
          const isBurst = (errBody.error as string)?.toLowerCase().includes('too many requests');
          return makeSoftError(
            'RATE_LIMIT',
            'Slow down',
            isBurst
              ? `Rate limit reached. Try again in ${Number.isFinite(retryAfter) ? retryAfter : 30}s.`
              : 'Daily limit reached. Resets at midnight.',
            {
              retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 30,
              resetInSeconds: Number.isFinite(resetInSeconds) ? resetInSeconds : undefined,
            },
          );
        }

        if (DEBUG) {
          console.log('[Vision] API error', {
            endpoint,
            status: res.status,
            message: errMsg,
          });
        }

        return makeSoftError('SERVER', 'AI unavailable', normalizedErrMsg || 'Something went wrong.');
      }

      const data = (await res.json()) as T;
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  return makeSoftError('SERVER', 'AI unavailable', 'AI service is temporarily unavailable. Please try again in a moment.');
}

interface SignedUploadResponse {
  uploadUrl: string;
  r2Key: string;
  method: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

async function uploadToR2(imageUri: string, kind: 'before' | 'after'): Promise<string | VisionSoftError> {
  if (DEBUG) console.log(`[Vision] Compressing ${kind} image…`);
  const { buffer } = await compressImage(imageUri);

  const signed = await postJSON<SignedUploadResponse>('/v1/r2/signed-upload', { kind });
  if (isSoftError(signed)) return signed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    let putRes: Response;
    try {
      putRes = await authenticatedFetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: buffer,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAuthRequiredError(error)) {
        return makeSoftError('SESSION_EXPIRED', 'Session expired', 'Please sign in again.');
      }
      return makeSoftError('NETWORK', 'Connection issue', 'Upload failed due to a network issue.');
    }

    if (!putRes.ok) {
      if (putRes.status === 401) {
        return makeSoftError('SESSION_EXPIRED', 'Session expired', 'Please sign in again.');
      }
      if (putRes.status === 429) {
        return makeSoftError('RATE_LIMIT', 'Slow down', 'Rate limit reached. Try again in 30s.', {
          retryAfterSeconds: 30,
        });
      }
      return makeSoftError('SERVER', 'Upload failed', `Upload failed with status ${putRes.status}.`);
    }
  } finally {
    clearTimeout(timer);
  }

  return signed.r2Key;
}

export class CloudVisionService implements MealVisionService {
  private _lastR2Key: string | null = null;
  get lastR2Key(): string | null {
    return this._lastR2Key;
  }

  async verifyFood(imageUri: string): Promise<FoodCheckResult | VisionSoftError> {
    const r2Key = await uploadToR2(imageUri, 'before');
    if (isSoftError(r2Key)) return r2Key;

    this._lastR2Key = r2Key;
    return postJSON<FoodCheckResult>('/v1/vision/verify-food', { r2Key });
  }

  async compareMeal(preImageUri: string, postImageUri: string): Promise<CompareResult | VisionSoftError> {
    const preKey = preImageUri.startsWith('uploads/')
      ? preImageUri
      : await uploadToR2(preImageUri, 'before');
    if (isSoftError(preKey)) return preKey;

    const postKey = await uploadToR2(postImageUri, 'after');
    if (isSoftError(postKey)) return postKey;

    return postJSON<CompareResult>('/v1/vision/compare-meal', { preKey, postKey });
  }

  async estimateCalories(r2Key: string): Promise<NutritionEstimate | null> {
    const data = await postJSON<Omit<NutritionEstimate, 'source'>>('/v1/nutrition/estimate', { r2Key });
    if (isSoftError(data)) return null;
    return { ...data, source: 'vision' };
  }
}
