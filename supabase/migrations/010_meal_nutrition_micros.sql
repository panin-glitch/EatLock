-- ============================================================
-- 010: Add micro-nutrient columns to meal_nutrition
-- ============================================================
-- Extends meal_nutrition with fibre, sugar, sodium, saturated fat,
-- a flexible JSONB column for additional micronutrients, and
-- source_refs to track where enrichment data came from.
-- ============================================================

alter table public.meal_nutrition
  add column if not exists fiber_g         real,
  add column if not exists sugar_g         real,
  add column if not exists sodium_mg       real,
  add column if not exists saturated_fat_g real,
  add column if not exists micronutrients  jsonb default '{}'::jsonb,
  add column if not exists source_refs     jsonb default '[]'::jsonb;

-- micronutrients schema example:
-- {
--   "vitamin_a_ug": 120,
--   "vitamin_c_mg": 8.5,
--   "calcium_mg": 45,
--   "iron_mg": 1.2
-- }
--
-- source_refs schema example:
-- [
--   { "type": "openfoodfacts", "barcode": "3017620422003" },
--   { "type": "vision_estimate", "model": "gpt-4o-mini" }
-- ]

comment on column public.meal_nutrition.fiber_g         is 'Dietary fiber in grams';
comment on column public.meal_nutrition.sugar_g         is 'Total sugars in grams';
comment on column public.meal_nutrition.sodium_mg       is 'Sodium in milligrams';
comment on column public.meal_nutrition.saturated_fat_g is 'Saturated fat in grams';
comment on column public.meal_nutrition.micronutrients  is 'Flexible JSONB for vitamin/mineral values';
comment on column public.meal_nutrition.source_refs     is 'Array of provenance objects for the nutrition data';
