/**
 * MealVisionService — abstract interface for meal verification.
 *
 * Implementations:
 *   - CloudVisionService  (production — calls backend GPT Vision)
 *   - MockVisionService   (Expo Go / dev offline testing)
 */

import { FoodCheckResult, CompareResult, NutritionEstimate, VisionSoftError } from './types';

export interface MealVisionService {
  /**
   * Verify a single image contains real food.
   * @param imageUri - local file URI from camera
   * @returns FoodCheckResult with isFood, confidence, quality, reasonCode, roastLine
   */
  verifyFood(imageUri: string): Promise<FoodCheckResult | VisionSoftError>;

  /**
   * Compare before and after meal images to determine how much was eaten.
   * @param preImageUri  - URI of the "before" photo
   * @param postImageUri - URI of the "after" photo
   * @returns CompareResult with verdict, confidence, roastLine
   */
  compareMeal(preImageUri: string, postImageUri: string): Promise<CompareResult | VisionSoftError>;

  /**
   * Estimate calories from a verified before-scan image.
   * Uses the r2Key from a previous upload. Returns null on failure.
   * @param r2Key - R2 object key from the upload step
   */
  estimateCalories(r2Key: string): Promise<NutritionEstimate | null>;
}
