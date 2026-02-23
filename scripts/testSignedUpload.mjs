/**
 * scripts/testSignedUpload.mjs
 *
 * Developer-only script: request a signed upload URL from your Cloudflare Worker.
 *
 * Required env vars:
 *   WORKER_API_URL  – e.g. https://eat-lock-worker.your-account.workers.dev
 *   ACCESS_TOKEN    – Supabase JWT (get one via `npm run token`)
 *
 * Usage (Windows PowerShell):
 *   $env:WORKER_API_URL="https://...workers.dev"; $env:ACCESS_TOKEN="ey..."; npm run test:signed-upload
 *
 * Usage (bash / macOS / Linux):
 *   WORKER_API_URL="https://...workers.dev" ACCESS_TOKEN="ey..." npm run test:signed-upload
 */

const { WORKER_API_URL, ACCESS_TOKEN } = process.env;

if (!WORKER_API_URL || !ACCESS_TOKEN) {
  console.error(
    "ERROR=Missing one or more required env vars: WORKER_API_URL, ACCESS_TOKEN"
  );
  process.exit(1);
}

try {
  const res = await fetch(`${WORKER_API_URL}/v1/r2/signed-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kind: "before" }),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(`ERROR=${JSON.stringify(json)}`);
    process.exit(1);
  }

  console.log(JSON.stringify(json, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`ERROR=${err.message}`);
  process.exit(1);
}
