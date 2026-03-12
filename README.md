# EatLock

## Local environment setup (Expo client)

Create a local `.env` file in repo root:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_WORKER_API_URL=
EXPO_PUBLIC_PASSWORD_RESET_URL=
```

`EXPO_PUBLIC_PASSWORD_RESET_URL` is optional, but if you set it, it must be an HTTPS URL for your secure web password reset flow.

Run the app:

```bash
npx expo start
```

## Cloudflare Worker secrets/vars

Set Worker secrets (never commit these values):

```bash
cd backend
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put OPENAI_API_KEY
```

Set Worker vars (if not already configured):

```bash
cd backend
wrangler secret put SUPABASE_URL
# or set SUPABASE_URL under [vars] in wrangler.toml during deployment config
```

## Security notes

- Expo client must only use `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- Data protection relies on Supabase RLS policies.
