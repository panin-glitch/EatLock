/**
 * Regression test for the SQL hardening that restricts group RPC execution to
 * authenticated users only.
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

const migrationPath = path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations', '018_groups_rpc_execute_hardening.sql');
const sql = readFileSync(migrationPath, 'utf8');

assert(
  'join_group_by_code revokes public execute',
  /revoke all on function public\.join_group_by_code\(text\) from public;/i.test(sql),
);

assert(
  'join_group_by_code revokes anon execute',
  /revoke all on function public\.join_group_by_code\(text\) from anon;/i.test(sql),
);

assert(
  'join_group_by_code grants authenticated execute',
  /grant execute on function public\.join_group_by_code\(text\) to authenticated;/i.test(sql),
);

assert(
  'get_group_member_stats revokes public execute',
  /revoke all on function public\.get_group_member_stats\(uuid,\s*uuid\) from public;/i.test(sql),
);

assert(
  'get_group_member_stats revokes anon execute',
  /revoke all on function public\.get_group_member_stats\(uuid,\s*uuid\) from anon;/i.test(sql),
);

assert(
  'get_group_member_stats grants authenticated execute',
  /grant execute on function public\.get_group_member_stats\(uuid,\s*uuid\) to authenticated;/i.test(sql),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
