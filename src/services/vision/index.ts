/**
 * Vision service factory.
 *
 * Returns CloudVisionService which calls the backend GPT Vision endpoints.
 * MockVisionService is still exported for unit-testing / offline dev.
 */

export { type MealVisionService } from './MealVisionService';
export { CloudVisionService } from './CloudVisionService';
export { MockVisionService } from './MockVisionService';
export * from './types';
export * from './roasts';

import { MealVisionService } from './MealVisionService';
import { CloudVisionService } from './CloudVisionService';

let _instance: MealVisionService | null = null;

/**
 * Get the singleton vision service instance.
 * Returns CloudVisionService (calls backend → GPT Vision).
 */
export function getVisionService(): MealVisionService {
  if (!_instance) {
    _instance = new CloudVisionService();
  }
  return _instance;
}
