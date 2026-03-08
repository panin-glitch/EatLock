export type VisionQueueStage = 'START_SCAN' | 'END_SCAN';
export type VisionQuotaKind = 'verify' | 'compare';

export interface ValidatedVisionQueuePayload {
  sessionId: string | null;
  stage: VisionQueueStage;
  quotaKind: VisionQuotaKind;
  r2Keys: Record<string, string>;
}

export interface ValidationError {
  ok: false;
  error: string;
  status: number;
}

export interface ValidationSuccess {
  ok: true;
  value: ValidatedVisionQueuePayload;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: string, status = 400): ValidationError {
  return { ok: false, error, status };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSessionId(raw: unknown): string | null | ValidationError {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return fail('session_id must be a string when provided');
  const trimmed = raw.trim();
  if (!UUID_RE.test(trimmed)) return fail('session_id must be a UUID when provided');
  return trimmed;
}

function normalizeR2Keys(raw: unknown): Record<string, string> | ValidationError {
  if (!isPlainObject(raw)) return fail('r2_keys must be an object');

  const entries = Object.entries(raw);
  if (entries.length === 0) return fail('Missing r2_keys');

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return fail(`r2_keys.${key} must be a non-empty string`);
    }
    normalized[key] = value.trim();
  }

  return normalized;
}

function isValidationError(
  value: Record<string, string> | ValidationError,
): value is ValidationError {
  return (value as ValidationError).ok === false;
}

export function quotaKindFromStage(stage: VisionQueueStage): VisionQuotaKind {
  return stage === 'START_SCAN' ? 'verify' : 'compare';
}

export function validateVisionQueuePayload(body: unknown): ValidationError | ValidationSuccess {
  if (!isPlainObject(body)) return fail('Invalid JSON body');

  const stage = body.stage;
  if (stage !== 'START_SCAN' && stage !== 'END_SCAN') {
    return fail('stage must be START_SCAN or END_SCAN');
  }

  const sessionId = normalizeSessionId(body.session_id);
  if (sessionId && typeof sessionId !== 'string') {
    return sessionId;
  }

  const r2Keys = normalizeR2Keys(body.r2_keys);
  if (isValidationError(r2Keys)) {
    return r2Keys;
  }

  if (stage === 'START_SCAN') {
    const keys = Object.keys(r2Keys);
    if (keys.length !== 1 || !('image' in r2Keys)) {
      return fail('START_SCAN requires exactly one r2_keys.image value');
    }
  }

  if (stage === 'END_SCAN') {
    const keys = Object.keys(r2Keys).sort();
    if (keys.length !== 2 || keys[0] !== 'after' || keys[1] !== 'before') {
      return fail('END_SCAN requires exactly r2_keys.before and r2_keys.after');
    }
  }

  return {
    ok: true,
    value: {
      sessionId,
      stage,
      quotaKind: quotaKindFromStage(stage),
      r2Keys,
    },
  };
}