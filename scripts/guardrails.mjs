import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".expo",
  ".venv",
]);
const GITIGNORE_PATH = path.join(ROOT, ".gitignore");
const gitignoreRules = fs.existsSync(GITIGNORE_PATH)
  ? fs.readFileSync(GITIGNORE_PATH, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  : [];

function mustExist(p) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${p}`);
  return full;
}
function read(p) { return fs.readFileSync(p, "utf8"); }
function fail(msg) { console.error(`GUARDRAILS_FAIL: ${msg}`); process.exit(1); }
function assertNo(pattern, text, where, hint="") {
  pattern.lastIndex = 0;
  if (pattern.test(text)) fail(`${where} violates rule: ${pattern}. ${hint}`.trim());
}

function gitignorePatternToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  const escaped = normalized.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  const regexBody = escaped
    .replace(/\*\*/g, "<<<DOUBLE_STAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLE_STAR>>>/g, ".*");
  if (normalized.startsWith("/")) {
    return new RegExp(`^${regexBody.slice(1)}$`);
  }
  if (normalized.includes("/")) {
    return new RegExp(`(^|/)${regexBody}$`);
  }
  return new RegExp(`(^|/)${regexBody}$`);
}

function isIgnoredByGitignore(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  let ignored = false;
  for (const rule of gitignoreRules) {
    const negated = rule.startsWith("!");
    const pattern = negated ? rule.slice(1) : rule;
    if (!pattern) continue;
    const regex = gitignorePatternToRegex(pattern);
    if (regex.test(normalized)) {
      ignored = !negated;
    }
  }
  return ignored;
}

function listTrackedFiles() {
  const files = [];

  function walk(relDir = "") {
    const absDir = path.join(ROOT, relDir);
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const relPath = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(relPath);
        continue;
      }
      if (entry.isFile()) {
        if (isIgnoredByGitignore(relPath)) continue;
        files.push(relPath);
      }
    }
  }

  walk();
  return files;
}

function isScannableTextFile(filePath) {
  if (filePath.includes("node_modules/") || filePath.startsWith(".git/")) return false;
  return /\.(js|mjs|cjs|ts|tsx|json|toml|md)$/i.test(filePath);
}

function isTrackedEnvFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName === ".env.example") return false;
  if (/^\.env(\..*)?$/i.test(baseName)) return true;
  if (/\/\.env(\..*)?$/i.test(normalized)) return true;
  return false;
}

function runSecretLeakChecks() {
  const trackedFiles = listTrackedFiles();

  const trackedEnvFiles = trackedFiles.filter(isTrackedEnvFile);
  if (trackedEnvFiles.length > 0) {
    fail(`Tracked .env files are not allowed: ${trackedEnvFiles.join(", ")}`);
  }

  const leakPatterns = [
    {
      pattern: /sb_secret_[A-Za-z0-9_-]+/g,
      hint: "Never commit Supabase secret keys.",
    },
    {
      pattern: /SUPABASE_SERVICE_(ROLE_)?KEY\s*:\s*['"`]/g,
      hint: "Do not hardcode service role keys.",
    },
    {
      pattern: /SUPABASE_ANON_KEY\s*:\s*['"`]sb_/g,
      hint: "Do not hardcode anon/publishable keys.",
    },
    {
      pattern: /SUPABASE_URL\s*:\s*['"`]https:\/\/[a-z0-9-]+\.supabase\.co/gi,
      hint: "Do not hardcode Supabase URLs in client config.",
    },
    {
      pattern: /Bearer\s+['"`][A-Za-z0-9._-]{20,}['"`]/g,
      hint: "Do not hardcode bearer tokens.",
    },
  ];

  for (const rel of trackedFiles) {
    if (!isScannableTextFile(rel)) continue;
    const fullPath = path.join(ROOT, rel);
    let text = "";
    try {
      text = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    for (const { pattern, hint } of leakPatterns) {
      assertNo(pattern, text, rel, hint);
    }
  }
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

// 5) Tracked file secret leakage checks
runSecretLeakChecks();

console.log("GUARDRAILS_OK");
process.exit(0);
