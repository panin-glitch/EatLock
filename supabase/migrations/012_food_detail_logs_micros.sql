-- ============================================================
-- 012: Add food_detail column + meal_logs micros columns
-- ============================================================

-- Optional user-provided food description detail
alter table public.meal_nutrition
  add column if not exists food_detail text;

comment on column public.meal_nutrition.food_detail is 'Optional user-provided description detail';

-- Add micros to meal_logs so stats can read them locally
alter table public.meal_logs
  add column if not exists fiber_g         real,
  add column if not exists sugar_g         real,
  add column if not exists sodium_mg       real,
  add column if not exists saturated_fat_g real;
