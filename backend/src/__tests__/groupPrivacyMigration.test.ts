/**
 * Regression test for the SQL hardening that removes cross-user reads from
 * dormant group membership and stats surfaces.
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

const migrationPath = path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations', '019_group_privacy_hardening.sql');
const sql = readFileSync(migrationPath, 'utf8');

assert(
  'group member select policy is recreated as self-only',
  /create policy "group_members_select_self"[\s\S]*?for select[\s\S]*?using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(sql),
);

assert(
  'stats RPC rejects requests for another user',
  /p_user_id is distinct from auth\.uid\(\)/i.test(sql),
);

assert(
  'stats RPC aggregates only the caller user_id',
  /from public\.meal_sessions[\s\S]*?where user_id = auth\.uid\(\)/i.test(sql)
    && /from public\.meal_logs[\s\S]*?where user_id = auth\.uid\(\)/i.test(sql),
  'expected both meal_sessions and meal_logs queries to use auth.uid()',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
