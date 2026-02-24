-- 005: RLS hardening — remove overly permissive barcode_cache write policies
-- The backend uses the service-role key which bypasses RLS,
-- so anonymous / regular users should NOT be able to insert or update cache rows.

-- Drop the permissive INSERT policy
drop policy if exists "barcode_cache_service_write" on public.barcode_cache;

-- Drop the permissive UPDATE policy
drop policy if exists "barcode_cache_service_update" on public.barcode_cache;

-- barcode_cache_read (SELECT using true) stays — cache data is non-sensitive.
