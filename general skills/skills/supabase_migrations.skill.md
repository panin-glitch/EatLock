# Supabase Changes — MUST OBEY

- All DB changes go in supabase/migrations/*.sql
- No “random SQL” in VS Code notes or in app code.
- RPC functions must lock search_path:
  alter function ... set search_path = public;