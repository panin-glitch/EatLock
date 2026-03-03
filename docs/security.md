# Security

Security architecture and hardening measures in EatLock.

## Authentication

All API endpoints require a valid Supabase JWT in the `Authorization: Bearer`
header. The backend validates tokens via `GET /auth/v1/user` against Supabase.

Anonymous sign-in is supported — users are upgraded when they link an email.

## R2 Object Ownership

All R2 keys follow the pattern `uploads/{user_id}/{timestamp}_{kind}_{uuid}.jpg`.

The helper `ownsR2Key(userId, key)`:
1. Strips any leading `/` from the key.
2. Checks that the key starts with `uploads/{userId}/`.

Every endpoint that accepts an R2 key — signed upload, direct upload, nutrition
estimate, verify-food, compare-meal — calls `ownsR2Key()` before proceeding.

## Row-Level Security (RLS)

All Supabase tables have RLS enabled:

| Table                  | SELECT             | INSERT / UPDATE          |
|------------------------|--------------------|--------------------------|
| meal_sessions          | `auth.uid() = user_id` | `auth.uid() = user_id` |
| meal_nutrition         | `auth.uid() = user_id` | `auth.uid() = user_id` |
| meal_logs              | `auth.uid() = user_id` | `auth.uid() = user_id` |
| user_settings          | `auth.uid() = user_id` | `auth.uid() = user_id` |
| vision_daily_usage     | `auth.uid() = user_id` | via RPC only            |
| nutrition_daily_usage  | `auth.uid() = user_id` | via RPC only            |
| barcode_cache          | public SELECT      | service_role only         |

## Quota Functions

`consume_vision_quota` and `consume_nutrition_quota` are `SECURITY DEFINER`
functions with `set search_path = public`. Only `service_role` can EXECUTE them.
They use UTC dates for consistent daily resets.

## Rate Limiting

- **Burst limit**: per-user + per-IP sliding window (60s).
- **Active limit**: max concurrent requests per user.
- **Daily quota**: enforced via Supabase RPC (configurable via env vars).

All limits are gated by `ENFORCE_LIMITS=true` environment variable.

## Guardrails CI

`scripts/guardrails.mjs` runs on every commit and checks:
1. No raw `.includes(userId)` patterns — must use `ownsR2Key()`.
2. All R2 key validations use `startsWith(\`uploads/\${…}/\`)`.
3. No hardcoded secrets in source.

Must print `GUARDRAILS_OK` to pass.

## Content Security

- R2 uploads are restricted to `image/jpeg`, max 5 MB.
- R2 objects are cleaned up after 30 minutes via scheduled cron.
- No user-supplied HTML or scripts are rendered.
