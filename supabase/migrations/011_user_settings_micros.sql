-- ============================================================
-- 011: User settings — micronutrients opt-in
-- ============================================================

create table if not exists public.user_settings (
  user_id                uuid        primary key references auth.users(id) on delete cascade,
  micronutrients_enabled boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Users can read their own settings
create policy "Users can view own settings"
  on public.user_settings
  for select
  using (auth.uid() = user_id);

-- Users can insert their own row
create policy "Users can insert own settings"
  on public.user_settings
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own row
create policy "Users can update own settings"
  on public.user_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can do everything (no separate policy needed since
-- service_role bypasses RLS, but grant explicit table access):
grant select, insert, update on public.user_settings to service_role;
grant select, insert, update on public.user_settings to authenticated;
