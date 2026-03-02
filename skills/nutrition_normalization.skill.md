# Nutrition Normalization — MUST OBEY

## OpenFoodFacts rules
- Prefer *_serving fields.
- Else if *_100g exists AND serving_quantity_g exists:
  per_serving = per_100g * serving_quantity_g / 100
- Else return per_100g and label it per_100g (do NOT pretend it’s per serving).