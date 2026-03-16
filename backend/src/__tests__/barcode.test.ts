/**
 * Unit tests for barcode nutrient resolution logic.
 *
 * Run: node --experimental-strip-types backend/src/__tests__/barcode.test.ts
 *      (or npx vitest / jest if the project adds a runner)
 */

declare const process: { exit(code?: number): never };

// ── Re-implement resolveNutrient here so we can test it in isolation ──
// (we also export it from barcode.ts via fetchOpenFoodFacts, but that
//  function does network I/O — so we duplicate the pure helper.)

function resolveNutrient(
  perServing: number | undefined,
  per100g: number | undefined,
  servingQty: number | undefined,
): [number | null, boolean] {
  if (perServing != null && Number.isFinite(perServing)) {
    return [perServing, false];
  }
  if (per100g != null && Number.isFinite(per100g)) {
    if (servingQty != null && Number.isFinite(servingQty) && servingQty > 0) {
      return [per100g * servingQty / 100, false];
    }
    return [per100g, true];
  }
  return [null, false];
}

function round1(v: number | null): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}

// ── Sample OFF payloads ──

/** Nutella 400 g — has both per-serving and per-100g */
const nutella = {
  product_name: 'Nutella',
  nutriments: {
    'energy-kcal_100g': 539,
    'energy-kcal_serving': 80.85,
    proteins_100g: 6.3,
    proteins_serving: 0.945,
    carbohydrates_100g: 57.5,
    carbohydrates_serving: 8.625,
    fat_100g: 30.9,
    fat_serving: 4.635,
  },
  serving_size: '15 g',
  serving_quantity: 15,
};

/** Generic rice — only per-100g, no serving data */
const rice = {
  product_name: 'White Rice',
  nutriments: {
    'energy-kcal_100g': 130,
    proteins_100g: 2.7,
    carbohydrates_100g: 28,
    fat_100g: 0.3,
  },
  serving_size: undefined as string | undefined,
  serving_quantity: undefined as number | undefined,
};

/** Coca-Cola 330 ml — per-100 g + serving_quantity but no explicit per-serving fields */
const coke = {
  product_name: 'Coca-Cola Classic',
  nutriments: {
    'energy-kcal_100g': 42,
    proteins_100g: 0,
    carbohydrates_100g: 10.6,
    fat_100g: 0,
  },
  serving_size: '330 ml',
  serving_quantity: 330,
};

/** Empty nutriments */
const mystery = {
  product_name: 'Mystery Item',
  nutriments: {} as Record<string, number | undefined>,
};

// ── Test runner ──

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function resolveProduct(p: typeof nutella) {
  const n = p.nutriments as Record<string, number | undefined>;
  const sq = p.serving_quantity;
  const [cal, calP] = resolveNutrient(n['energy-kcal_serving'], n['energy-kcal_100g'], sq);
  const [pro, proP] = resolveNutrient(n.proteins_serving, n.proteins_100g, sq);
  const [carb, carbP] = resolveNutrient(n.carbohydrates_serving, n.carbohydrates_100g, sq);
  const [fat, fatP] = resolveNutrient(n.fat_serving, n.fat_100g, sq);
  return {
    calories: cal != null ? Math.round(cal) : null,
    protein_g: round1(pro),
    carbs_g: round1(carb),
    fat_g: round1(fat),
    per_100g: calP || proP || carbP || fatP,
  };
}

// Nutella: should use per-serving values directly
{
  const r = resolveProduct(nutella);
  assert('nutella cal', r.calories, 81);
  assert('nutella protein', r.protein_g, 0.9);
  assert('nutella carbs', r.carbs_g, 8.6);
  assert('nutella fat', r.fat_g, 4.6);
  assert('nutella per_100g', r.per_100g, false);
}

// Rice: no serving data → raw per-100g fallback
{
  const r = resolveProduct(rice as any);
  assert('rice cal', r.calories, 130);
  assert('rice protein', r.protein_g, 2.7);
  assert('rice carbs', r.carbs_g, 28);
  assert('rice fat', r.fat_g, 0.3);
  assert('rice per_100g', r.per_100g, true);
}

// Coke: per-100g + serving_quantity=330 → computed per-serving
{
  const r = resolveProduct(coke as any);
  assert('coke cal', r.calories, 139); // 42 * 330/100 = 138.6 → 139
  assert('coke protein', r.protein_g, 0);
  assert('coke carbs', r.carbs_g, 35); // 10.6 * 3.3 = 34.98 → 35
  assert('coke fat', r.fat_g, 0);
  assert('coke per_100g', r.per_100g, false);
}

// Mystery: empty nutriments → nulls
{
  const r = resolveProduct(mystery as any);
  assert('mystery cal', r.calories, null);
  assert('mystery protein', r.protein_g, null);
  assert('mystery per_100g', r.per_100g, false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
