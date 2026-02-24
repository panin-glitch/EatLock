# Security Notes

## No secrets in repo

- Do not commit service-role keys, OpenAI keys, access tokens, or `.env` files.
- Client app config should only contain public values (for example Supabase publishable/anon key and worker URL).
- Cloudflare Worker secrets must be stored with `wrangler secret put`.

## Local development

- Use `backend/.dev.vars` or local `.env` files only on your machine.
- These are ignored by Git via `.gitignore`.

## Logging

- Request logs should contain request id, endpoint, and status code.
- Never log raw Authorization tokens, keys, or image bytes.
