import type { Env } from './index';

const MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPENAI_API = 'https://api.openai.com/v1/responses';
const NUTRITION_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const SHORT_WINDOW_MS = 60 * 1000;
const NUTRITION_BURST_LIMIT = 6;
const ACTIVE_LIMIT = 3;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const burstBuckets = new Map<string, number[]>();
const activeBuckets = new Map<string, number[]>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function checkRate(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

function checkBurst(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = (burstBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (current.length >= limit) {
    burstBuckets.set(key, current);
    return false;
  }
  current.push(now);
  burstBuckets.set(key, current);
  return true;
}

function checkActive(key: string): boolean {
  const now = Date.now();
  const current = (activeBuckets.get(key) || []).filter((ts) => now - ts < SHORT_WINDOW_MS);
  if (current.length >= ACTIVE_LIMIT) {
    activeBuckets.set(key, current);
    return false;
  }
  current.push(now);
  activeBuckets.set(key, current);
  return true;
}

async function getUser(
  request: Request,
  env: Env,
): Promise<{ user_id: string } | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err('Missing or invalid Authorization header', 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (jwt.split('.').length !== 3) {
    return err('Invalid or expired token', 401);
  }

  console.log('[Auth] supabase host:', new URL(env.SUPABASE_URL).host);
  console.log('[Auth] token head:', jwt.slice(0, 12), 'len:', jwt.length);

  const whoamiRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (whoamiRes.status === 401 || !whoamiRes.ok) {
    return err('Invalid or expired token', 401);
  }

  const whoami = (await whoamiRes.json().catch(() => null)) as { id?: string } | null;
  if (!whoami?.id) {
    return err('Invalid or expired token', 401);
  }

  return { user_id: whoami.id };
}

async function r2ToDataUrl(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;

  const ct = obj.httpMetadata?.contentType || 'image/jpeg';
  if (ct.toLowerCase().split(';')[0] !== 'image/jpeg') {
    throw { status: 415, message: `Unsupported content type for ${key}` };
  }

  const bytes = await obj.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw { status: 413, message: `Image ${key} exceeds 5 MB limit` };
  }

  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }

  return `data:${ct};base64,${btoa(binary)}`;
}

const NUTRITION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'nutrition_estimate',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      food_label: { type: 'string' },
      estimated_calories: { type: 'number' },
      min_calories: { type: 'number' },
      max_calories: { type: 'number' },
      confidence: { type: 'number' },
      notes: { type: 'string' },
    },
    required: [
      'food_label',
      'estimated_calories',
      'min_calories',
      'max_calories',
      'confidence',
      'notes',
    ],
    additionalProperties: false,
  },
};

const NUTRITION_SYSTEM = `Estimate meal calories from a single food photo.
Return a realistic range and a concise assumption note.
Never claim certainty.`;

export async function handleNutritionEstimate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getUser(request, env);
  if (auth instanceof Response) return auth;

  if (!checkRate(`nutrition:${auth.user_id}`, NUTRITION_LIMIT)) {
    return err('Rate limit exceeded (10 nutrition estimates/day)', 429);
  }

  if (!checkActive(`nutrition-active:${auth.user_id}`)) {
    return err('Too many active scan requests. Please wait a moment.', 429);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const burstUserOk = checkBurst(`nutrition:user:${auth.user_id}`, NUTRITION_BURST_LIMIT, SHORT_WINDOW_MS);
  const burstIpOk = checkBurst(`nutrition:ip:${ip}`, NUTRITION_BURST_LIMIT * 2, SHORT_WINDOW_MS);
  if (!burstUserOk || !burstIpOk) {
    return err('Too many nutrition requests. Please slow down.', 429);
  }

  let body: { r2Key?: string };
  try {
    body = (await request.json()) as { r2Key?: string };
  } catch {
    return err('Invalid JSON body');
  }

  if (!body.r2Key || typeof body.r2Key !== 'string') {
    return err('Missing "r2Key" field');
  }
  if (Object.keys(body as Record<string, unknown>).length !== 1) {
    return err('nutrition estimate accepts exactly one image key', 400);
  }
  if (!body.r2Key.includes(auth.user_id)) {
    return err('r2Key does not belong to user', 403);
  }

  try {
    const dataUrl = await r2ToDataUrl(env.IMAGES, body.r2Key);
    if (!dataUrl) {
      return err('Image not found in R2 (expired or invalid key)', 404);
    }

    const apiBody = {
      model: MODEL,
      instructions: NUTRITION_SYSTEM,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Estimate calories for this meal.' },
            { type: 'input_image', image_url: dataUrl, detail: 'low' },
          ],
        },
      ],
      text: { format: NUTRITION_SCHEMA },
    };

    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(apiBody),
    });

    if (!res.ok) {
      return err(`AI error: ${res.status}`, 502);
    }

    const data = (await res.json()) as {
      output: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
    };

    const msgOutput = data.output?.find((o: any) => o.type === 'message');
    const textContent = msgOutput?.content?.find((c: any) => c.type === 'output_text');
    if (!textContent?.text) {
      return err('No text in OpenAI response', 502);
    }

    return json(JSON.parse(textContent.text));
  } catch (e: any) {
    if (e.status === 413 || e.status === 415) return err(e.message, e.status);
    return err(`Nutrition estimation error: ${e.message}`, 502);
  }
}
