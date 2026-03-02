import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function mustExist(p) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${p}`);
  return full;
}
function read(p) { return fs.readFileSync(p, "utf8"); }
function fail(msg) { console.error(`GUARDRAILS_FAIL: ${msg}`); process.exit(1); }
function assertNo(pattern, text, where, hint="") {
  if (pattern.test(text)) fail(`${where} violates rule: ${pattern}. ${hint}`.trim());
}

// 1) Post-scan must never call verifyFood
const postScan = read(mustExist("src/screens/PostScanCameraScreen.tsx"));
assertNo(/\bverifyFood\s*\(/, postScan, "PostScanCameraScreen.tsx",
  "Post-scan must go to compareMeal(before, after).");

// 2) Backend must not use includes(auth.user_id)
for (const f of ["backend/src/index.ts", "backend/src/vision.ts", "backend/src/nutrition.ts"]) {
  const t = read(mustExist(f));
  assertNo(/includes\(\s*auth\.user_id\s*\)/, t, f, "Use startsWith(`uploads/${auth.user_id}/`).");
}

// 3) Barcode serving bug pattern
const barcode = read(mustExist("backend/src/barcode.ts"));
assertNo(/servingKcal\s*=\s*n\?\.\s*\[\s*['"]energy-kcal_100g['"]\s*\]/, barcode, "backend/src/barcode.ts",
  "Do not treat _100g as serving.");

// 4) Skills must exist
mustExist("skills/scan_state_machine.skill.md");
mustExist("skills/nutrition_normalization.skill.md");
mustExist("skills/r2_ownership.skill.md");
mustExist("skills/supabase_migrations.skill.md");

console.log("GUARDRAILS_OK");
process.exit(0);