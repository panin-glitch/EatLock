/**
 * CloudVisionService — R2 signed-upload flow.
 */

import type { MealVisionService } from './MealVisionService';
import type { FoodCheckResult, CompareResult, NutritionEstimate, VisionSoftError } from './types';
import { compressImage } from './imageCompress';
import { getAccessToken, ensureAuth, refreshAuthSession, recreateAnonymousSession } from '../authService';
import { getUserSettings } from '../storage';
import { ENV } from '../../config/env';

const API = ENV.WORKER_API_URL;
const REQUEST_TIMEOUT = 45_000;

const __DEV__ = process.env.NODE_ENV !== 'production';
const DEBUG = __DEV__;
let hasLoggedTokenDebug = false;

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

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
  if (DEBUG && !hasLoggedTokenDebug) {
    console.log(`[Auth] token head=${token.slice(0, 12)} len=${token.length}`);
    hasLoggedTokenDebug = true;
  }
  return token;
}

async function shouldSendDevBypassHeader(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    const settings = await getUserSettings();
    return !!settings.developer?.disableQuotasDev;
  } catch {
    return false;
  }
}

async function fetchWithAuth(url: string, init: RequestInit, retryOn401 = true): Promise<Response> {
  const token = await getBearerToken();
  const baseHeaders = (init.headers || {}) as Record<string, string>;
  const useDevBypass = await shouldSendDevBypassHeader();

  const makeInit = (bearer: string): RequestInit => ({
    ...init,
    headers: {
      ...baseHeaders,
      Authorization: `Bearer ${bearer}`,
      'x-eatlock-supabase-url': ENV.SUPABASE_URL,
      'x-tadlock-supabase-url': ENV.SUPABASE_URL,
      ...(useDevBypass ? { 'X-Dev-Bypass': 'true' } : {}),
    },
  });

  let res = await fetch(url, makeInit(token));

  if (res.status === 401 && retryOn401) {
    if (DEBUG) console.warn(`[Vision] 401 on ${url} — refreshing token and retrying once`);
    let refreshed = await refreshAuthSession();
    if (!refreshed) {
      try {
        refreshed = await recreateAnonymousSession();
      } catch {
        refreshed = null;
      }
    }

    if (!refreshed) {
      return res;
    }

    res = await fetch(url, makeInit(refreshed));
  }

  return res;
}

async function postJSON<T>(endpoint: string, body: Record<string, unknown>): Promise<T | VisionSoftError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const url = `${API}${endpoint}`;

  if (DEBUG) console.log(`[Vision] POST ${url}`, JSON.stringify(body).slice(0, 120));

  try {
    let res: Response;
    try {
      res = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      if (DEBUG) {
        console.log('[Vision] network issue', {
          endpoint,
          message: networkErr?.message,
        });
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

      const errMsg =
        (errBody.error as string) ||
        (errBody.message as string) ||
        (raw ? raw.slice(0, 220) : `HTTP ${res.status}`);

      if (DEBUG) {
        console.log('[Vision] API error', {
          endpoint,
          status: res.status,
          message: errMsg,
        });
      }

      return makeSoftError('SERVER', 'AI unavailable', errMsg || 'Something went wrong.');
    }

    const data = (await res.json()) as T;
    return data;
  } finally {
    clearTimeout(timer);
  }
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
      putRes = await fetchWithAuth(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: buffer,
        signal: controller.signal,
      });
    } catch {
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
