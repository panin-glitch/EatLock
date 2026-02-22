/**
 * AppBlockerModule — JS bridge to the native Android Accessibility Service.
 *
 * In production (dev build), this talks to the actual native Kotlin module.
 * In Expo Go, it falls back to a no-op stub so the app doesn't crash.
 *
 * To build for real:
 * 1. npx expo prebuild
 * 2. Add EatLockAccessibilityService.kt in android/app/src/main/java/.../
 * 3. Register the service in AndroidManifest.xml
 */

import { NativeModules, Platform } from 'react-native';

interface AppBlockerNative {
  startBlocking(packageNames: string[]): Promise<void>;
  stopBlocking(): Promise<void>;
  isAccessibilityEnabled(): Promise<boolean>;
  getBlockedAttempts(): Promise<number>;
}

/**
 * Try to load the native module. Falls back to stubs if unavailable.
 */
function getNativeModule(): AppBlockerNative {
  if (Platform.OS !== 'android') {
    return createStub();
  }
  const mod = NativeModules.AppBlockerModule;
  if (mod) return mod as AppBlockerNative;
  return createStub();
}

function createStub(): AppBlockerNative {
  return {
    async startBlocking(packageNames: string[]) {
      console.log('[AppBlockerModule stub] startBlocking:', packageNames);
    },
    async stopBlocking() {
      console.log('[AppBlockerModule stub] stopBlocking');
    },
    async isAccessibilityEnabled() {
      return false;
    },
    async getBlockedAttempts() {
      return 0;
    },
  };
}

const AppBlocker = getNativeModule();

export async function startNativeBlocking(packages: string[]): Promise<void> {
  return AppBlocker.startBlocking(packages);
}

export async function stopNativeBlocking(): Promise<void> {
  return AppBlocker.stopBlocking();
}

export async function isAccessibilityServiceEnabled(): Promise<boolean> {
  return AppBlocker.isAccessibilityEnabled();
}

export async function getNativeBlockedAttempts(): Promise<number> {
  return AppBlocker.getBlockedAttempts();
}

export default AppBlocker;
