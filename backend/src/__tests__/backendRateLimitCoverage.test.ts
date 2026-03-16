/**
 * Regression test to keep backend-only rate limiting on sensitive worker
 * endpoints. Endpoint discovery is expected; abuse prevention must stay
 * server-side.
 */

declare const __dirname: string;
declare const process: { exit(code?: number): never };
declare function require(name: string): any;

const { readFileSync } = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.error(`FAIL: ${label}${details ? `\n  ${details}` : ''}`);
}

function read(relPath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

const workerIndex = read('index.ts');
const vision = read('vision.ts');
const nutrition = read('nutrition.ts');
const barcode = read('barcode.ts');
const enrichMicros = read('enrich_micros.ts');
const foodLabel = read('food_label.ts');
const cloudVisionClient = read(path.resolve(__dirname, '..', '..', '..', 'src', 'services', 'vision', 'CloudVisionService.ts'));

assert(
  'worker upload and enqueue routes use backend rate-limit helpers',
  /consumeRateLimit\(/.test(workerIndex) && /acquireConcurrencySlot\(/.test(workerIndex),
);

assert(
  'vision handlers use backend rate-limit helpers',
  /consumeRateLimit\(/.test(vision) && /consumeQuota\(/.test(vision) && /acquireConcurrencySlot\(/.test(vision),
);

assert(
  'nutrition handler uses backend rate-limit helpers',
  /consumeRateLimit\(/.test(nutrition) && /consumeNutritionQuota\(/.test(nutrition) && /acquireConcurrencySlot\(/.test(nutrition),
);

assert(
  'barcode handler uses backend rate-limit helpers',
  /consumeRateLimit\(/.test(barcode),
);

assert(
  'food label handler uses backend rate-limit helpers',
  /consumeRateLimit\(/.test(foodLabel),
);

assert(
  'micronutrient enrichment handler uses backend rate-limit helpers',
  /consumeRateLimit\(/.test(enrichMicros),
);

assert(
  'client vision service only handles 429 responses and does not maintain request counters',
  !/setItem\(|localStorage|AsyncStorage|remaining.*today|consumeForfeitToday/.test(cloudVisionClient),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
