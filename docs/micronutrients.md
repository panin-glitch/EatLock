# Micronutrients

The micronutrients feature adds fiber, sugar, sodium, saturated fat, and
optional vitamin/mineral tracking to EatLock meals.

## Feature Flag

Gated by `user_settings.micronutrients_enabled` (Supabase table). Toggle lives
in **Settings → Micronutrients (beta)**.

## Data Model

### meal_nutrition columns (migration 010)

| Column            | Type  | Description                      |
|-------------------|-------|----------------------------------|
| fiber_g           | real  | Dietary fiber in grams           |
| sugar_g           | real  | Total sugars in grams            |
| sodium_mg         | real  | Sodium in milligrams             |
| saturated_fat_g   | real  | Saturated fat in grams           |
| micronutrients    | jsonb | `{ vitamin_a_ug, calcium_mg … }` |
| source_refs       | jsonb | Provenance array                 |

### user_settings table (migration 011)

| Column                   | Type    | Default |
|--------------------------|---------|---------|
| user_id                  | uuid PK | —       |
| micronutrients_enabled   | boolean | false   |

### meal_logs extension (migration 012)

Adds `fiber_g`, `sugar_g`, `sodium_mg`, `saturated_fat_g` to `meal_logs`.

## Sources

### Vision meals

The `POST /v1/nutrition/estimate` response now includes `fiber_g`, `sugar_g`,
`sodium_mg`, and `saturated_fat_g` in the GPT structured output schema. These
are populated automatically on every new scan.

### Barcode meals

`POST /v1/meals/:mealId/enrich_micros` fetches extended nutrients from
OpenFoodFacts: fiber, sugars, sodium (converted g → mg), saturated fat, plus
optional vitamins (A, C, calcium, iron, potassium, magnesium).

## Frontend Behavior

### Meal Detail (TodaysMealsList modal)

- **Toggle OFF**: micros section hidden.
- **Toggle ON, micros present**: shows fiber / sugar / sodium / sat fat pills.
- **Toggle ON, micros missing**: shows "Compute micros" button → calls
  `enrich_micros` → loading spinner → renders pills.

### Progress Screen (StatsScreen)

- **Toggle ON**: shows a "Micronutrients" card with weekly/monthly totals for
  fiber, sugar, sodium, sat fat.
- **Some meals missing micros**: banner with count + "Compute" button that
  batch-enriches up to 10 meals.

### Food Label Editing

- Tap the pencil icon next to the food name in the detail modal.
- Type new label → confirm.
- Calls `PUT /v1/meals/:mealId/food_label` → sets `source='user'`.

## API Endpoints

| Method | Path                                | Purpose                      |
|--------|-------------------------------------|------------------------------|
| POST   | `/v1/meals/:mealId/enrich_micros`   | Enrich meal with micros      |
| PUT    | `/v1/meals/:mealId/food_label`      | Update food label (user edit)|

## Manual Test Plan

### 1. Toggle Behavior

1. Open Settings → Micronutrients toggle should be OFF by default.
2. Turn ON → close and reopen Settings → toggle should still be ON.
3. Turn OFF → verify meal detail modals no longer show micros section.

### 2. Old Meal Enrichment

1. Enable micros toggle.
2. Open a meal logged before micros existed (no fiber_g etc.).
3. Tap "Compute micros" in the detail modal.
4. Verify loading spinner appears → then fiber/sugar/sodium/sat fat pills render.
5. Close and reopen the modal — enriched values should persist.

### 3. New Vision Meal

1. Scan a new meal with the camera.
2. Complete the session.
3. Open meal detail — fiber/sugar/sodium/sat fat should already be populated
   (from the updated nutrition estimate schema).

### 4. Barcode Meal Enrichment

1. Scan a barcode (e.g. Nutella).
2. Complete the session.
3. Open meal detail → tap "Compute micros".
4. Verify values are pulled from OpenFoodFacts.

### 5. Progress Screen Micros

1. Enable toggle, log 2+ meals.
2. Open Progress → scroll to "Micronutrients" card.
3. Verify fiber/sugar/sodium/sat fat totals are shown.
4. If some meals lack micros, verify the "X meals missing micros" banner
   appears with a "Compute" button.
5. Tap "Compute" → verify enrichment completes.

### 6. Food Label Editing

1. Open any meal detail modal.
2. Tap pencil icon next to food name.
3. Edit the label → tap checkmark.
4. Close and reopen — new label should persist.
5. In Supabase: verify `meal_nutrition.source` is now `'user'`.

### 7. Recompute After Edit

1. Edit a food label on a meal that has micros.
2. Tap "Compute micros" again — should re-fetch.
