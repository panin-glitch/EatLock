-- 004: meal_logs table + meal_nutrition macros columns
-- Supports multiple completed meals per day+type (e.g. 2 snacks)

-- ============================================================
-- meal_logs — one row per completed scan (photo or barcode)
-- ============================================================

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_session_id uuid references public.meal_sessions(id) on delete set null,
  log_date date not null default current_date,
  meal_type public.meal_type not null,
  food_label text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  source text not null default 'vision',  -- 'vision' | 'barcode' | 'user'
  barcode text,
  completed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists meal_logs_user_date_idx
  on public.meal_logs(user_id, log_date);

create index if not exists meal_logs_user_date_type_idx
  on public.meal_logs(user_id, log_date, meal_type);

-- ============================================================
-- Add macros to meal_nutrition
-- ============================================================

alter table public.meal_nutrition
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists food_label_detail text;

-- ============================================================
-- RLS for meal_logs
-- ============================================================

alter table public.meal_logs enable row level security;

create policy "own_meal_logs"
  on public.meal_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
