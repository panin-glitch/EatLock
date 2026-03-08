/**
 * microsService — calls the backend enrich_micros endpoint
 * and the update food_label endpoint.
 */

import { ENV } from '../config/env';
import { fetchWithAuth as authenticatedFetch } from './authFetch';
import type { MicrosEnrichResult } from './vision/types';

const API = ENV.WORKER_API_URL;

/**
 * Enrich a meal with micronutrient data.
 */
export async function enrichMicros(mealId: string): Promise<MicrosEnrichResult> {
  const res = await authenticatedFetch(`${API}/v1/meals/${mealId}/enrich_micros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await authenticatedFetch(`${API}/v1/meals/${mealId}/food_label`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ food_label: foodLabel, detail: detail || undefined }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
}
