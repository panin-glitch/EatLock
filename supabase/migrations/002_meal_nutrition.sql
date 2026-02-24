-- meal_nutrition + barcode_cache tables
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- ============================================================
-- meal_nutrition — calorie estimates per meal session
-- ============================================================

create table if not exists public.meal_nutrition (
  id uuid primary key default gen_random_uuid(),
  meal_session_id uuid references public.meal_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_label text,
  estimated_calories int,
  min_calories int,
  max_calories int,
  confidence numeric,
  source text not null default 'vision', -- 'vision' | 'barcode' | 'user'
  created_at timestamptz not null default now()
);

create index if not exists meal_nutrition_session_idx
  on public.meal_nutrition(meal_session_id);

create index if not exists meal_nutrition_user_idx
  on public.meal_nutrition(user_id, created_at desc);

-- ============================================================
-- barcode_cache — cached barcode → nutrition lookup
-- ============================================================

create table if not exists public.barcode_cache (
  barcode text primary key,
  barcode_type text not null, -- 'ean13', 'upc_a', etc.
  product_name text,
  calories_per_serving int,
  serving_size text,
  source_api text, -- 'openfoodfacts', etc.
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.meal_nutrition enable row level security;
alter table public.barcode_cache enable row level security;

create policy "own_meal_nutrition"
  on public.meal_nutrition for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- barcode_cache is shared/public read, service-key write
create policy "barcode_cache_read"
  on public.barcode_cache for select
  using (true);

create policy "barcode_cache_service_write"
  on public.barcode_cache for insert
  with check (true);

create policy "barcode_cache_service_update"
  on public.barcode_cache for update
  using (true);
