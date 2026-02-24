/**
 * Roast / praise library -- fallback messages when GPT roastLine is empty.
 *
 * Maps new FoodReasonCode and CompareVerdict enums to message pools.
 */

import type { FoodReasonCode, CompareVerdict } from './types';

// -- Pre-scan roasts (food check failures) --

const preScanRoasts: Record<string, string[]> = {
  NOT_FOOD: [
    'This ain\u2019t dinner, it\u2019s decor \ud83d\udca0\ud83d\ude4f',
    'That\u2019s giving \u201cno food found\u201d energy \ud83d\udca0',
    'Bro where is the food \ud83d\ude2d\ud83e\udd40',
    'I said FOOD not vibes \ud83d\ude4f\ud83d\udca0',
  ],
  HAND_SELFIE: [
    'Bro\u2026 that\u2019s your hand \ud83d\ude2d\ud83e\udd40',
    'Fingers are not a food group bestie \ud83d\udca0',
    'Move the hand, show the meal \ud83d\ude4f',
  ],
  TOO_DARK: [
    'Are you eating in the void?? \ud83d\udca0\ud83d\ude2d',
    'Turn on a light bestie I\u2019m blind \ud83d\ude2d',
    'This darker than my sense of humor \ud83d\udca0',
  ],
  TOO_BLURRY: [
    'Did you take this mid-earthquake?? \ud83d\ude2d',
    'Blurry pics are not it fam \ud83d\udca0\ud83d\ude4f',
    'My grandma takes sharper pics. On a flip phone \ud83d\udca0',
    'Steady hands champion \ud83d\ude4f',
  ],
  NO_PLATE: [
    'I see vibes but no plate \ud83d\udca0\ud83e\udd40',
    'Food usually comes on a plate just saying \ud83d\ude2d',
    'Where\u2019s the dish tho?? \ud83d\ude4f',
  ],
  BAD_FRAMING: [
    'Nice ceiling. Now show me the meal \ud83d\udca0',
    'The food is hiding bestie center it \ud83d\ude2d',
    'Frame the plate like it\u2019s your best angle \ud83d\ude4f',
  ],
  OK: [
    'Something went wrong my bad \ud83d\ude4f try again?',
    'My circuits are confused lol one more try? \ud83d\udca0',
  ],
};

// -- Post-scan roasts (meal comparison verdicts) --

const postScanMessages: Record<CompareVerdict, string[]> = {
  EATEN: [
    'Clean plate club you absolute LEGEND \ud83d\ude02\u2728',
    'Not a crumb left. Respect \ud83d\ude4f',
    'Plate so clean it\u2019s ready for round two \ud83d\udca0\ud83d\ude02',
    'You ATE ate. Literally \u2728\ud83d\ude4f',
    'Demolished. Chef would be sobbing rn \ud83d\ude2d\u2728',
  ],
  PARTIAL: [
    'Almost!! Your fork gave up before you did \ud83d\ude2d',
    'Solid effort but I see leftovers bestie \ud83d\udca0',
    'Participation trophy incoming \ud83d\ude4f\ud83e\udd40',
    'You ate MOST of it\u2026 future you says thanks \u2728',
  ],
  UNCHANGED: [
    'The food is\u2026 still there. All of it \ud83d\udca0\ud83d\ude2d',
    'Did you just stare at it the whole time?? \ud83d\ude2d',
    'You had ONE job. Eat \ud83d\udca0\ud83e\udd40',
    'Before and after looking suspiciously identical \ud83d\udca0',
    'The food is starting to feel rejected fr \ud83d\ude2d\ud83d\ude4f',
  ],
  UNVERIFIABLE: [
    'I genuinely can\u2019t tell if you ate. Mysterious \ud83d\udca0',
    'My circuits are split rn. Benefit of the doubt ig \ud83d\ude4f',
    'Inconclusive. Try a better angle next time \ud83d\ude2d',
  ],
};

// -- Helpers --

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a fallback roast for a pre-scan rejection.
 * Prefer the GPT-generated `roastLine` from FoodCheckResult when available.
 */
export function getPreScanRoast(reasonCode: FoodReasonCode): string {
  const pool = preScanRoasts[reasonCode] ?? preScanRoasts.NOT_FOOD;
  return randomPick(pool);
}

/**
 * Get a fallback roast/praise for a post-scan comparison verdict.
 * Prefer the GPT-generated `roastLine` from CompareResult when available.
 */
export function getPostScanRoast(verdict: CompareVerdict): string {
  const pool = postScanMessages[verdict] ?? postScanMessages.UNVERIFIABLE;
  return randomPick(pool);
}

/**
 * Positive feedback when food is confirmed during pre-scan.
 */
export function getFoodConfirmedMessage(): string {
  const msgs = [
    'Food detected! Looking fire \ud83d\ude02\u2728',
    'Yep that\u2019s food. Let\u2019s gooo \ud83d\ude4f',
    'Real food confirmed. My sensors are satisfied \u2728',
    'Nice spread! Verified and ready \ud83d\ude4f\u2728',
  ];
  return randomPick(msgs);
}
