/**
 * MealVisionService — abstract interface for meal verification.
 *
 * Implementations:
 *   - CloudVisionService  (production — calls backend GPT Vision)
 *   - MockVisionService   (Expo Go / dev offline testing)
 */

import { FoodCheckResult, CompareResult } from './types';

export interface MealVisionService {
  /**
   * Verify a single image contains real food.
   * @param imageUri - local file URI from camera
   * @returns FoodCheckResult with isFood, confidence, quality, reasonCode, roastLine
   */
  verifyFood(imageUri: string): Promise<FoodCheckResult>;

  /**
   * Compare before and after meal images to determine how much was eaten.
   * @param preImageUri  - URI of the "before" photo
   * @param postImageUri - URI of the "after" photo
   * @returns CompareResult with verdict, confidence, roastLine
   */
  compareMeal(preImageUri: string, postImageUri: string): Promise<CompareResult>;
}
