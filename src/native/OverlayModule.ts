/**
 * OverlayModule — JS bridge to Android "Display over other apps" (TYPE_APPLICATION_OVERLAY).
 *
 * In production, the native module shows a full-screen overlay when a blocked app
 * gains focus. In Expo Go this is a no-op stub.
 *
 * To build for real:
 * 1. npx expo prebuild
 * 2. Add OverlayModule.kt in android/app/src/main/java/.../
 * 3. Request SYSTEM_ALERT_WINDOW permission in AndroidManifest.xml
 */

import { NativeModules, Platform } from 'react-native';

interface OverlayNative {
  showOverlay(): Promise<void>;
  hideOverlay(): Promise<void>;
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
}

function getNativeModule(): OverlayNative {
  if (Platform.OS !== 'android') {
    return createStub();
  }
  const mod = NativeModules.OverlayModule;
  if (mod) return mod as OverlayNative;
  return createStub();
}

function createStub(): OverlayNative {
  return {
    async showOverlay() {
      console.log('[OverlayModule stub] showOverlay');
    },
    async hideOverlay() {
      console.log('[OverlayModule stub] hideOverlay');
    },
    async hasOverlayPermission() {
      return false;
    },
    async requestOverlayPermission() {
      return false;
    },
  };
}

const Overlay = getNativeModule();

export async function showBlockerOverlay(): Promise<void> {
  return Overlay.showOverlay();
}

export async function hideBlockerOverlay(): Promise<void> {
  return Overlay.hideOverlay();
}

export async function hasOverlayPermission(): Promise<boolean> {
  return Overlay.hasOverlayPermission();
}

export async function requestOverlayPermission(): Promise<boolean> {
  return Overlay.requestOverlayPermission();
}

export default Overlay;
