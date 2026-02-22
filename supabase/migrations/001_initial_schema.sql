-- EatLock Supabase Schema
-- Run this in Supabase SQL Editor

-- ============================================================
-- ENUMS
-- ============================================================
create type public.meal_type as enum ('breakfast','lunch','dinner','snack','custom');

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meal_type public.meal_type not null,
  scheduled_time time not null,
  title text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date, meal_type)
);

create index if not exists meal_plans_user_date_idx
  on public.meal_plans(user_id, plan_date);

create table if not exists public.meal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type public.meal_type not null,
  plan_date date,
  planned_time time,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active', -- active|completed|cancelled
  breaks_used int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists meal_sessions_user_started_idx
  on public.meal_sessions(user_id, started_at desc);

create table if not exists public.blocked_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_name text not null,
  display_name text,
  is_blocked boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, package_name)
);

create table if not exists public.vision_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.meal_sessions(id) on delete set null,
  stage text not null, -- START_SCAN | END_SCAN
  r2_keys jsonb not null,
  status text not null default 'queued', -- queued|processing|done|failed
  result_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vision_jobs_user_created_idx
  on public.vision_jobs(user_id, created_at desc);

create table if not exists public.vision_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.vision_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verdict text not null, -- FOOD_OK|NOT_FOOD|UNCLEAR|CHEATING|FINISHED|NOT_FINISHED
  confidence numeric not null,
  finished_score numeric,
  reason text,
  roast text,
  signals jsonb,
  created_at timestamptz not null default now(),
  unique (job_id)
);

alter table public.vision_jobs
  add constraint vision_jobs_result_fk
  foreign key (result_id) references public.vision_results(id) on delete set null;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_sessions enable row level security;
alter table public.blocked_apps enable row level security;
alter table public.vision_jobs enable row level security;
alter table public.vision_results enable row level security;

create policy "own_profiles"
  on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_meal_plans"
  on public.meal_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_meal_sessions"
  on public.meal_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_blocked_apps"
  on public.blocked_apps for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_vision_jobs"
  on public.vision_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_vision_results"
  on public.vision_results for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- UPSERT HELPER FOR MEAL PLANS
-- ============================================================
-- The app uses INSERT ... ON CONFLICT (user_id, plan_date, meal_type)
-- DO UPDATE SET scheduled_time, title, is_enabled, updated_at
-- This is handled at the application/RPC level, no extra function needed.
