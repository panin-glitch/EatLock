-- 008: profiles username rename safety (table guards + unique index + RLS)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

drop policy if exists "own_profiles" on public.profiles;
drop policy if exists "profiles_select_self_or_same_group" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_select_self"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy "profiles_insert_self"
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_self"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
