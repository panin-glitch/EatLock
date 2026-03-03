# Security

For security architecture, RLS policies, R2 ownership rules, quotas, and guardrails, see: docs/security.md

## Secret handling (quick rules)
- Never commit service keys, API keys, tokens, or `.env` files.
- Store Worker secrets using `wrangler secret put`.