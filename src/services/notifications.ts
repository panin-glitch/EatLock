/**
 * Notifications service — pure stub implementation.
 *
 * expo-notifications has been removed to avoid Expo Go native module errors.
 * All functions are safe no-ops that maintain the correct interface.
 *
 * When building a production/development build, reinstall expo-notifications
 * and expo-device, then swap this file for the real implementation.
 */
import { MealSchedule } from '../types/models';

export async function requestNotificationPermissions(): Promise<boolean> {
  // Stubbed — no native notification module loaded
  return false;
}

export async function scheduleAllMealNotifications(_schedules: MealSchedule[]): Promise<void> {
  // Stubbed — schedules are saved in local storage and ready for real notifications
}

export async function cancelAllNotifications(): Promise<void> {
  // Stubbed
}
