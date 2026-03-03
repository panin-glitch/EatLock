/**
 * microsService — calls the backend enrich_micros endpoint
 * and the update food_label endpoint.
 */

import { ENV } from '../config/env';
import { getAccessToken, ensureAuth, refreshAuthSession, recreateAnonymousSession } from './authService';
import type { MicrosEnrichResult } from './vision/types';

const API = ENV.WORKER_API_URL;

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
  let token = await getAccessToken();
  if (!token) token = await ensureAuth();
  if (!token) throw new Error('Sign-in expired.');

  const makeInit = (bearer: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string> || {}),
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
  });

  let res = await fetch(url, makeInit(token));
  if (res.status === 401) {
    let refreshed = await refreshAuthSession();
    if (!refreshed) {
      try { refreshed = await recreateAnonymousSession(); } catch { refreshed = null; }
    }
    if (!refreshed) throw new Error('Sign-in expired.');
    res = await fetch(url, makeInit(refreshed));
  }
  return res;
}

/**
 * Enrich a meal with micronutrient data.
 */
export async function enrichMicros(mealId: string): Promise<MicrosEnrichResult> {
  const res = await fetchWithAuth(`${API}/v1/meals/${mealId}/enrich_micros`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<MicrosEnrichResult>;
}

/**
 * Update a meal's food_label (user edit).
 */
export async function updateFoodLabel(
  mealId: string,
  foodLabel: string,
  detail?: string,
): Promise<void> {
  const res = await fetchWithAuth(`${API}/v1/meals/${mealId}/food_label`, {
    method: 'PUT',
    body: JSON.stringify({ food_label: foodLabel, detail: detail || undefined }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
}
