/**
 * MockVisionService — returns random results for offline / Expo Go dev testing.
 *
 * Uses the new cloud-vision type shapes (FoodCheckResult, CompareResult)
 * so that screens work identically in mock mode.
 */

import { MealVisionService } from './MealVisionService';
import {
  FoodCheckResult,
  CompareResult,
  NutritionEstimate,
  FoodReasonCode,
  CompareVerdict,
  CompareReasonCode,
  VisionSoftError,
} from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockVisionService implements MealVisionService {
  async verifyFood(_imageUri: string): Promise<FoodCheckResult | VisionSoftError> {
    await delay(800 + Math.random() * 400);

    const roll = Math.random();
    if (roll < 0.9) {
      return {
        isFood: true,
        confidence: 0.85 + Math.random() * 0.15,
        hasPlateOrBowl: true,
        quality: { brightness: 1, blur: 1, framing: 1 },
        reasonCode: 'OK',
        roastLine: 'Looking tasty! Let us get started.',
        retakeHint: '',
      };
    }

    const reasons: FoodReasonCode[] = ['NOT_FOOD', 'TOO_DARK', 'TOO_BLURRY', 'HAND_SELFIE'];
    const reasonCode = reasons[Math.floor(Math.random() * reasons.length)];

    return {
      isFood: false,
      confidence: 0.3 + Math.random() * 0.3,
      hasPlateOrBowl: false,
      quality: {
        brightness: reasonCode === 'TOO_DARK' ? 0.2 : 1,
        blur: reasonCode === 'TOO_BLURRY' ? 0.15 : 1,
        framing: 1,
      },
      reasonCode,
      roastLine: 'Mock rejection — try again in production.',
      retakeHint: 'Take a clearer photo of your meal.',
    };
  }

  async compareMeal(_preImageUri: string, _postImageUri: string): Promise<CompareResult | VisionSoftError> {
    await delay(1000 + Math.random() * 500);

    const roll = Math.random();
    let verdict: CompareVerdict;
    let foodChangeScore: number;
    let reasonCode: CompareReasonCode;

    if (roll < 0.55) {
      verdict = 'EATEN';
      foodChangeScore = 0.85 + Math.random() * 0.15;
      reasonCode = 'OK';
    } else if (roll < 0.8) {
      verdict = 'PARTIAL';
      foodChangeScore = 0.35 + Math.random() * 0.35;
      reasonCode = 'PARTIAL';
    } else if (roll < 0.92) {
      verdict = 'UNCHANGED';
      foodChangeScore = Math.random() * 0.1;
      reasonCode = 'UNCHANGED';
    } else {
      verdict = 'UNVERIFIABLE';
      foodChangeScore = 0.5;
      reasonCode = 'CANT_TELL';
    }

    return {
      isSameScene: true,
      duplicateScore: foodChangeScore < 0.1 ? 0.95 : 0.15,
      foodChangeScore: Math.round(foodChangeScore * 100) / 100,
      verdict,
      confidence: 0.7 + Math.random() * 0.3,
      reasonCode,
      roastLine: verdict === 'EATEN' ? 'Clean plate club!' : 'Mock comparison result.',
      retakeHint: verdict === 'UNVERIFIABLE' ? 'Try matching the angle of the first photo.' : '',
    };
  }

  async estimateCalories(_r2Key: string): Promise<NutritionEstimate | null> {
    await delay(500 + Math.random() * 300);
    return {
      food_label: 'Mock meal',
      estimated_calories: 520,
      min_calories: 420,
      max_calories: 640,
      confidence: 0.74,
      notes: 'Mock estimate for local testing.',
      source: 'vision',
    };
  }
}
