/**
 * Client-side barcode lookup — calls backend POST /v1/barcode/lookup.
 */

import { ENV } from '../config/env';
import { fetchWithAuth as authenticatedFetch } from './authFetch';

const API = ENV.WORKER_API_URL;

export interface BarcodeLookupResult {
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_hint: string | null;
  /** True when values are per 100 g (no serving data available). */
  per_100g?: boolean;
  source: 'cache' | 'openfoodfacts' | 'not_found';
}

function normalizeBarcodeErrorMessage(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (lower.includes('1101') || lower.includes('internal error') || lower.includes('cloudflare') || status >= 500) {
    return 'Barcode service is temporarily unavailable. Please try scanning again.';
  }
  return message;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const res = await authenticatedFetch(`${API}/v1/barcode/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ barcode }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    const errMsg = normalizeBarcodeErrorMessage(
      (body.error as string) || (body.message as string) || raw || `Barcode lookup failed: ${res.status}`,
      res.status,
    );

    if (res.status >= 500 || errMsg.toLowerCase().includes('temporarily unavailable')) {
      return {
        name: 'Unknown item',
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        serving_hint: null,
        per_100g: false,
        source: 'not_found',
      };
    }

    throw new Error(errMsg);
  }

  return res.json() as Promise<BarcodeLookupResult>;
}
