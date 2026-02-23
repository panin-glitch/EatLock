/**
 * scripts/getToken.mjs
 *
 * Developer-only script: sign in to Supabase and print an access token.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD
 *
 * Usage (Windows PowerShell):
 *   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_ANON_KEY="ey..."; $env:TEST_EMAIL="you@example.com"; $env:TEST_PASSWORD="hunter2"; npm run token
 *
 * Usage (bash / macOS / Linux):
 *   SUPABASE_URL="https://xxx.supabase.co" SUPABASE_ANON_KEY="ey..." TEST_EMAIL="you@example.com" TEST_PASSWORD="hunter2" npm run token
 */

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD } =
  process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    "ERROR=Missing one or more required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

try {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error) {
    console.error(`ERROR=${error.message}`);
    process.exit(1);
  }

  console.log(`ACCESS_TOKEN=${data.session.access_token}`);
  process.exit(0);
} catch (err) {
  console.error(`ERROR=${err.message}`);
  process.exit(1);
}
