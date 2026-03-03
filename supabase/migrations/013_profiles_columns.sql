-- 013_profiles_columns.sql
-- Add missing columns + safe RLS for profiles

-- 1) Add missing columns the app expects
alter table public.profiles
  add column if not exists username text,
  add column if not exists updated_at timestamptz not null default now();

-- 2) Unique usernames (case-insensitive), allow NULL
create unique index if not exists profiles_username_unique
on public.profiles (lower(username))
where username is not null;

-- 3) Keep updated_at fresh on updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- 4) RLS policies (own row only)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);