/**
 * Types for the cloud-based GPT Vision verification pipeline.
 *
 * These schemas mirror the OpenAI Structured Output JSON schemas
 * used by the backend endpoints POST /v1/vision/verify-food and
 * POST /v1/vision/compare-meal.
 */

// ── Pre-scan (single-image food check) ──

export type FoodReasonCode =
  | 'OK'
  | 'NOT_FOOD'
  | 'HAND_SELFIE'
  | 'TOO_DARK'
  | 'TOO_BLURRY'
  | 'NO_PLATE'
  | 'BAD_FRAMING';

export interface ImageQuality {
  brightness: number;  // 0-1 (1 = perfect)
  blur: number;        // 0-1 (1 = sharp)
  framing: number;     // 0-1 (1 = well-framed)
}

export interface FoodCheckResult {
  isFood: boolean;
  confidence: number;        // 0-1
  hasPlateOrBowl: boolean;
  quality: ImageQuality;
  reasonCode: FoodReasonCode;
  roastLine: string;          // GPT-generated witty one-liner
  retakeHint: string;         // actionable user hint if rejected
}

// ── Post-scan (before/after comparison) ──

export type CompareVerdict =
  | 'EATEN'
  | 'PARTIAL'
  | 'UNCHANGED'
  | 'UNVERIFIABLE';

export type CompareReasonCode =
  | 'OK'
  | 'DUPLICATE_AFTER'
  | 'UNCHANGED'
  | 'PARTIAL'
  | 'ANGLE_MISMATCH'
  | 'LIGHTING_MISMATCH'
  | 'CANT_TELL';

export interface CompareResult {
  isSameScene: boolean;
  duplicateScore: number;     // 0-1  how similar after is to before
  foodChangeScore: number;    // 0-1  how much food disappeared
  verdict: CompareVerdict;
  confidence: number;         // 0-1
  reasonCode: CompareReasonCode;
  roastLine: string;          // GPT-generated witty verdict line
  retakeHint: string;         // actionable hint when unverifiable
}

// ── Nutrition estimate ──

export interface NutritionEstimate {
  food_label: string;
  estimated_calories: number;
  min_calories: number;
  max_calories: number;
  confidence: number;  // 0-1
  notes: string;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  source: 'vision' | 'barcode' | 'user';
}

// ── Session lifecycle ──

export type SessionStatus =
  | 'ACTIVE'
  | 'VERIFIED'
  | 'PARTIAL'
  | 'FAILED'
  | 'INCOMPLETE';

// ── Backward-compat aliases ──

/** @deprecated Use FoodReasonCode */
export type ReasonCode = FoodReasonCode;
/** @deprecated Use CompareVerdict */
export type Verdict = CompareVerdict;
