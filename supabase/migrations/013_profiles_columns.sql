-- 013: Repair profiles table (add username + updated_at) for existing projects

alter table public.profiles
  add column if not exists username text,
  add column if not exists updated_at timestamptz not null default now();

-- Unique usernames (case-insensitive), allow NULL
create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null;

-- Auto-update updated_at on updates
create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();