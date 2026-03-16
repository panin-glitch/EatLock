/**
 * Regression test for the SQL hardening that makes active-slot acquisition
 * atomic per bucket. Without the advisory lock, concurrent requests can all
 * observe the same active count and bypass the intended limit.
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

const migrationPath = path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations', '016_rate_limit_slot_locking.sql');
const sql = readFileSync(migrationPath, 'utf8');

assert(
  'migration replaces acquire_rate_limit_slot',
  /create or replace function public\.acquire_rate_limit_slot\(/i.test(sql),
);

assert(
  'migration uses a transaction-scoped advisory lock',
  /pg_advisory_xact_lock\s*\(/i.test(sql),
);

const lockIndex = sql.search(/pg_advisory_xact_lock\s*\(/i);
const countIndex = sql.search(/select count\(\*\)::int/i);
assert(
  'advisory lock is acquired before counting active slots',
  lockIndex !== -1 && countIndex !== -1 && lockIndex < countIndex,
  'expected pg_advisory_xact_lock() before the active-slot count query',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
