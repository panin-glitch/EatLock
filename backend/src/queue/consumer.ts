/**
 * Cloudflare Queue consumer — processes vision jobs.
 *
 * Retry semantics:
 * - Transient errors (OpenAI 5xx/timeout, R2 read failure, network) → retry with backoff up to 5 attempts.
 * - Permanent errors (invalid payload, missing r2_keys) → mark failed immediately.
 * - R2 objects deleted ONLY after successful processing; on final failure delete best-effort.
 */

import { createClient } from '@supabase/supabase-js';
import { START_SCAN_PROMPT, END_SCAN_PROMPT } from '../prompts/vision';
import { releaseConcurrencySlot, serviceKey } from '../limits';
import { ownsR2Key } from '../utils/ownership';
import { validateVisionQueuePayload } from '../visionPayload';

export interface QueueMessage {
  job_id: string;
  user_id: string;
  stage: 'START_SCAN' | 'END_SCAN';
  r2_keys: Record<string, string>;
  rate_limit_slot_id?: string;
  attempt?: number; // injected by retry logic
}

export interface Env {
  IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_SERVICE_KEY?: string;
  OPENAI_API_KEY: string;
}

const MAX_ATTEMPTS = 5;

/** Detect if an error is transient (worth retrying) */
function isTransient(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  // OpenAI 5xx, 429, network, R2 fetch failures
  if (/5\d{2}|429|timeout|network|econnreset|r2 object not found|fetch failed/i.test(msg)) return true;
  return false;
}

/** Best-effort delete of R2 objects */
async function deleteR2Objects(env: Env, keys: string[]): Promise<void> {
  for (const key of keys) {
    try { await env.IMAGES.delete(key); } catch { /* best-effort */ }
  }
}

function activeBucketFor(stage: QueueMessage['stage'], userId: string): string {
  return `vision:${stage === 'START_SCAN' ? 'verify' : 'compare'}:active:${userId}`;
}

function matchesR2Keys(stored: unknown, expected: Record<string, string>): boolean {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
  const storedEntries = Object.entries(stored as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  if (storedEntries.length !== expectedEntries.length) return false;

  return storedEntries.every(([key, value], index) => {
    const [expectedKey, expectedValue] = expectedEntries[index];
    return key === expectedKey && value === expectedValue;
  });
}

export async function handleVisionQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, serviceKey(env), {
    auth: { persistSession: false },
  });

  for (const message of batch.messages) {
    const body = message.body;
    const attempt = body.attempt ?? 1;
    const { job_id, user_id, stage, r2_keys, rate_limit_slot_id } = body;
    const r2KeyList = r2_keys ? Object.values(r2_keys) : [];
    const releaseSlot = async () => {
      if (stage === 'START_SCAN' || stage === 'END_SCAN') {
        await releaseConcurrencySlot(env as any, activeBucketFor(stage, user_id), rate_limit_slot_id);
      }
    };

    // ── Permanent validation ──
    const validation = validateVisionQueuePayload({ stage, r2_keys });
    const invalid = !job_id
      ? 'missing job_id'
      : !validation.ok
        ? validation.error
        : Object.values(validation.value.r2Keys).some((key) => !ownsR2Key(user_id, key))
          ? 'r2_key does not belong to user'
          : null;
    if (invalid) {
      console.error(`[VisionQueue] Permanent error for job ${job_id}: ${invalid}`);
      await supabase
        .from('vision_jobs')
        .update({ status: 'failed', error: `Invalid payload: ${invalid}`, updated_at: new Date().toISOString() })
        .eq('id', job_id)
        .then(() => {}, () => {});
      await releaseSlot();
      await deleteR2Objects(env, r2KeyList);
      message.ack();
      continue;
    }

    const { data: jobRow } = await supabase
      .from('vision_jobs')
      .select('id, user_id, stage, r2_keys, status')
      .eq('id', job_id)
      .single();

    if (!jobRow) {
      await releaseSlot();
      await deleteR2Objects(env, r2KeyList);
      message.ack();
      continue;
    }

    if (
      jobRow.user_id !== user_id ||
      jobRow.stage !== stage ||
      !matchesR2Keys(jobRow.r2_keys, r2_keys)
    ) {
      await supabase
        .from('vision_jobs')
        .update({ status: 'failed', error: 'Queue payload did not match stored job', updated_at: new Date().toISOString() })
        .eq('id', job_id)
        .then(() => {}, () => {});
      await releaseSlot();
      await deleteR2Objects(env, r2KeyList);
      message.ack();
      continue;
    }

    if (jobRow.status === 'done') {
      await releaseSlot();
      message.ack();
      continue;
    }

    try {
      // 1. Mark job as processing
      await supabase
        .from('vision_jobs')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', job_id);

      // 2. Download images from R2
      const imageContents: { role: string; base64: string; key: string }[] = [];

      for (const [label, r2Key] of Object.entries(r2_keys)) {
        const obj = await env.IMAGES.get(r2Key);
        if (!obj) throw new Error(`R2 object not found: ${r2Key}`);
        const arrayBuf = await obj.arrayBuffer();
        const base64 = bufferToBase64(arrayBuf);
        imageContents.push({ role: label, base64, key: r2Key });
      }

      // 3. Build OpenAI request
      const prompt = stage === 'START_SCAN' ? START_SCAN_PROMPT : END_SCAN_PROMPT;

      const imageMessages = imageContents.map((img) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${img.base64}`,
          detail: 'low' as const,
        },
      }));

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: stage === 'START_SCAN'
                    ? 'Analyze this food image:'
                    : 'Compare these BEFORE and AFTER meal images:',
                },
                ...imageMessages,
              ],
            },
          ],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });

      if (!openaiResponse.ok) {
        const errText = await openaiResponse.text();
        throw new Error(`OpenAI API error ${openaiResponse.status}: ${errText}`);
      }

      const openaiData = await openaiResponse.json() as any;
      const rawContent = openaiData.choices?.[0]?.message?.content ?? '';

      // 4. Parse JSON verdict (strip markdown fences if present)
      const jsonStr = rawContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const verdict = JSON.parse(jsonStr);

      // 5. Write vision_results
      const { data: resultRow, error: insertErr } = await supabase
        .from('vision_results')
        .insert({
          job_id,
          user_id,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          finished_score: verdict.finished_score ?? null,
          reason: verdict.reason,
          roast: verdict.roast,
          signals: verdict.signals,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      // 6. Update job status to done
      await supabase
        .from('vision_jobs')
        .update({
          status: 'done',
          result_id: resultRow.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job_id);

      // 7. Delete images from R2 ONLY after success
      await deleteR2Objects(env, r2KeyList);

      await releaseSlot();
      message.ack();
    } catch (err: any) {
      console.error(`[VisionQueue] Job ${job_id} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);

      if (isTransient(err) && attempt < MAX_ATTEMPTS) {
        // Retry with exponential backoff — requeue with incremented attempt
        // Delay: min(2^attempt * 1000, 30000) ms via message.retry() built-in backoff
        await supabase
          .from('vision_jobs')
          .update({ status: 'queued', error: `Attempt ${attempt} failed: ${err.message?.slice(0, 200)}`, updated_at: new Date().toISOString() })
          .eq('id', job_id)
          .then(() => {}, () => {});
        message.retry({ delaySeconds: Math.min(Math.pow(2, attempt), 30) });
      } else {
        // Max attempts exhausted or permanent error — mark failed
        await supabase
          .from('vision_jobs')
          .update({
            status: 'failed',
            error: `After ${attempt} attempts: ${err.message?.slice(0, 400)}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job_id)
          .then(() => {}, () => {});
        // Best-effort R2 cleanup on final failure
        await releaseSlot();
        await deleteR2Objects(env, r2KeyList);
        message.ack();
      }
    }
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
