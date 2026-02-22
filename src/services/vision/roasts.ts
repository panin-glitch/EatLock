/**
 * Roast / praise library -- fallback messages when GPT roastLine is empty.
 *
 * Maps new FoodReasonCode and CompareVerdict enums to message pools.
 */

import type { FoodReasonCode, CompareVerdict } from './types';

// -- Pre-scan roasts (food check failures) --

const preScanRoasts: Record<string, string[]> = {
  NOT_FOOD: [
    'That is a table. I asked for FOOD.',
    'Bold of you to scan air. Feed me pixels of real food.',
    'I have seen better meals in a screensaver.',
    'Is this performance art? Where is the food?',
  ],
  HAND_SELFIE: [
    'Move your hand. I am trying to judge your food, not your manicure.',
    'Fingers are not a food group. Try again.',
    'I can see your thumb. Fascinating. Now show me the food.',
  ],
  TOO_DARK: [
    'Are you eating in a cave? Turn on a light.',
    'I am a food scanner, not a bat. I need light.',
    'This is darker than your chances of eating mindfully.',
  ],
  TOO_BLURRY: [
    'Did you take this while running from your responsibilities?',
    'I need food, not abstract art.',
    'My grandma takes sharper photos. With a flip phone.',
    'Steady hands, champion. Try again.',
  ],
  NO_PLATE: [
    'I see something, but no plate or bowl. Where is the meal?',
    'Points for creativity, but I need actual food on a dish.',
    'Food usually comes on a plate. Just saying.',
  ],
  BAD_FRAMING: [
    'I appreciate the effort, but centre the food in frame.',
    'Is the food hiding? Point the camera at it properly.',
    'Nice ceiling. Now show me the meal.',
  ],
  OK: [
    'Hmm, something went wrong. Try a clearer photo.',
    'My circuits are confused. One more try?',
  ],
};

// -- Post-scan roasts (meal comparison verdicts) --

const postScanMessages: Record<CompareVerdict, string[]> = {
  EATEN: [
    'Clean plate club! You absolute legend.',
    'Not a crumb left. Respect.',
    'The plate is spotless. Chef would be proud.',
    'You did not just eat -- you DOMINATED that meal.',
    'Plate so clean, it is ready for the next meal already.',
  ],
  PARTIAL: [
    'Solid effort. Most of it is gone, but I see leftovers.',
    'Almost there! Your fork gave up before you did.',
    'Not bad, not great. A participation trophy is on its way.',
    'You ate most of it -- your future self says thanks.',
  ],
  UNCHANGED: [
    'The food is... still there. All of it.',
    'Did you just stare at your meal the whole time?',
    'You had ONE job. Eat. The. Food.',
    'The before and after look suspiciously identical.',
    'I think the food is starting to feel rejected.',
  ],
  UNVERIFIABLE: [
    'I genuinely cannot tell if you ate. Lighting? Angle? Mystery?',
    'My circuits are split. Maybe you ate, maybe you did not.',
    'Inconclusive. I will give you the benefit of the doubt... this time.',
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
    'Food detected! Looking delicious.',
    'Yep, that is definitely food. Let us get started!',
    'Confirmed: real food. My sensors are satisfied.',
    'Nice spread! Food verified. Ready when you are.',
  ];
  return randomPick(msgs);
}
