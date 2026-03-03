# Scan Flow

End-to-end flow for scanning and logging a meal in EatLock.

## 1. Pre-Scan (MealInfoScreen → PreScanCameraScreen)

1. User selects **meal type** (Breakfast / Lunch / Dinner / Snack) and enters an
   optional **food name**.
2. Camera opens. Two modes:
   - **Photo scan** — user takes a "before" photo. The image is uploaded to R2
     via signed URL, then sent to `POST /v1/nutrition/estimate` which returns
     calories + macros + micros (fiber, sugar, sodium, sat fat) via GPT-4o-mini.
   - **Barcode scan** — user scans a barcode. `POST /v1/barcode/lookup` returns
     cached or fresh OpenFoodFacts data. Optionally the user can also take a
     "before" photo for the comparison step later.
3. A `ResultCard` shows the nutrition estimate.
4. User taps **Start eating** → `startSession()` is called → session enters
   `ACTIVE` state.

## 2. Active Session (MealSessionActiveScreen / StrictModeSessionScreen)

- Timer counts elapsed eating time.
- If strict mode: apps are blocked via `blockingEngine`.
- Session can be ended by user or by timeout.

## 3. Post-Scan (PostScanCameraScreen)

1. Camera opens again.
   - **Photo sessions** — user takes an "after" photo, sent to
     `POST /v1/vision/compare-meal` with both before + after R2 keys.
   - **Barcode sessions without before photo** — triggers barcode re-scan.
   - **Barcode sessions with before photo** — same as photo sessions.
2. Compare result yields verdict: `EATEN` / `PARTIAL` / `UNCHANGED` /
   `UNVERIFIABLE`, plus a roast line.
3. Empty plates are valid — `compareMeal` is called directly without a
   `verifyFood` gate.

## 4. Session Summary (SessionSummaryScreen)

- Shows calories, macros, verdict, roast message.
- Optional distraction rating (1–5 stars).
- Session saved locally + logged to Supabase via `logCompletedMeal()`.

## 5. Enrichment

- If the user has enabled **Micronutrients (beta)** in Settings, the meal detail
  view offers a "Compute micros" button that calls
  `POST /v1/meals/:mealId/enrich_micros`.
- For barcode meals this pulls extended nutrients from OpenFoodFacts.
- For vision meals, fiber/sugar/sodium/sat-fat are already included in the
  estimate response (since the schema was extended).

## 6. Data Flow

```
PreScanCamera → R2 upload → /nutrition/estimate → ResultCard
                                                     ↓
                                              startSession()
                                                     ↓
                                          PostScanCamera → /compare-meal
                                                     ↓
                                           SessionSummary → logCompletedMeal()
                                                     ↓
                                           Supabase: meal_sessions, meal_nutrition, meal_logs
```
