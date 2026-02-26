/**
 * Client-side barcode lookup — calls backend POST /v1/barcode/lookup.
 */

import { ENV } from '../config/env';
import { getAccessToken, ensureAuth, refreshAuthSession, recreateAnonymousSession } from './authService';

const API = ENV.WORKER_API_URL;

export interface BarcodeLookupResult {
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_hint: string | null;
  source: 'cache' | 'openfoodfacts' | 'not_found';
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

async function getBearerToken(): Promise<string> {
  let token = await getAccessToken();
  if (!token) token = await ensureAuth();
  if (!token || !isJwt(token)) throw new Error('Auth token invalid');
  return token;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const token = await getBearerToken();

  const makeInit = (bearer: string): RequestInit => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'x-tadlock-supabase-url': ENV.SUPABASE_URL,
    },
    body: JSON.stringify({ barcode }),
  });

  let res = await fetch(`${API}/v1/barcode/lookup`, makeInit(token));

  if (res.status === 401) {
    let refreshed = await refreshAuthSession();
    if (!refreshed) {
      try { refreshed = await recreateAnonymousSession(); } catch { refreshed = null; }
    }
    if (refreshed) {
      res = await fetch(`${API}/v1/barcode/lookup`, makeInit(refreshed));
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) || `Barcode lookup failed: ${res.status}`);
  }

  return res.json() as Promise<BarcodeLookupResult>;
}
