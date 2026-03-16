/**
 * Unit tests for strict queue payload validation.
 *
 * Run: node --experimental-strip-types backend/src/__tests__/visionPayload.test.ts
 */

declare const process: { exit(code?: number): never };

import { validateVisionQueuePayload } from '../visionPayload.ts';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, details?: unknown) {
  if (condition) {
    passed++;
    return;
  }

  failed++;
  console.error(`FAIL: ${label}`);
  if (details !== undefined) {
    console.error(details);
  }
}

{
  const result = validateVisionQueuePayload({
    stage: 'START_SCAN',
    r2_keys: { image: 'uploads/user-1/start.jpg' },
  });
  assert('start scan accepts image-only payload', result.ok === true, result);
}

{
  const result = validateVisionQueuePayload({
    stage: 'START_SCAN',
    r2_keys: { before: 'uploads/user-1/start.jpg' },
  });
  assert('start scan rejects non-image key', result.ok === false, result);
}

{
  const result = validateVisionQueuePayload({
    stage: 'END_SCAN',
    r2_keys: {
      before: 'uploads/user-1/before.jpg',
      after: 'uploads/user-1/after.jpg',
    },
  });
  assert('end scan accepts before/after payload', result.ok === true, result);
}

{
  const result = validateVisionQueuePayload({
    stage: 'END_SCAN',
    r2_keys: { image: 'uploads/user-1/after.jpg' },
  });
  assert('end scan rejects image-only payload', result.ok === false, result);
}

{
  const result = validateVisionQueuePayload({
    stage: 'END_SCAN',
    session_id: 'not-a-uuid',
    r2_keys: {
      before: 'uploads/user-1/before.jpg',
      after: 'uploads/user-1/after.jpg',
    },
  });
  assert('invalid session_id is rejected', result.ok === false, result);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
