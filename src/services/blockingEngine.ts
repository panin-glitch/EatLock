/**
 * BlockingEngine - Abstraction layer for app blocking functionality.
 * Reports real enforcement capability for the current build and platform.
 */

import { Platform } from 'react-native';
import {
  hasNativeAppBlockerModule,
  isAccessibilityServiceEnabled,
  startNativeBlocking,
  stopNativeBlocking,
} from '../native/AppBlockerModule';
import { hasNativeOverlayModule, hasOverlayPermission } from '../native/OverlayModule';
import { BlockingSupport, describeBlockingSupport } from './blockingSupport';

export interface BlockingEngineInterface {
  startBlocking(selectedApps: string[]): Promise<void>;
  stopBlocking(): Promise<void>;
  isBlocking(): boolean;
  isEnforced(): boolean;
  getBlockedApps(): string[];
  getBlockedAttempts(): number;
  recordBlockedAttempt(appName: string): void;
  reset(): void;
  getSupport(): Promise<BlockingSupport>;
}

function currentPlatform(): 'android' | 'ios' | 'other' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'other';
}

class NativeAwareBlockingEngine implements BlockingEngineInterface {
  private _isBlocking: boolean = false;
  private _isEnforced: boolean = false;
  private _blockedApps: string[] = [];
  private _blockedAttempts: number = 0;
  private _attemptLog: { app: string; time: Date }[] = [];

  async getSupport(): Promise<BlockingSupport> {
    const hasNativeModule = hasNativeAppBlockerModule();
    const accessibilityEnabled = hasNativeModule
      ? await isAccessibilityServiceEnabled().catch(() => false)
      : false;
    const overlayPermission = hasNativeModule && hasNativeOverlayModule()
      ? await hasOverlayPermission().catch(() => false)
      : false;

    return describeBlockingSupport({
      platform: currentPlatform(),
      hasNativeBlockerModule: hasNativeModule,
      accessibilityEnabled,
      overlayPermission,
    });
  }

  async startBlocking(selectedApps: string[]): Promise<void> {
    this._blockedApps = [...selectedApps];
    this._blockedAttempts = 0;
    this._attemptLog = [];
    const support = await this.getSupport();

    if (support.canEnforce) {
      await startNativeBlocking(selectedApps);
      this._isBlocking = true;
      this._isEnforced = true;
      return;
    }

    this._isBlocking = false;
    this._isEnforced = false;
    console.warn('[BlockingEngine] Device-level blocking unavailable:', support.detail);
  }

  async stopBlocking(): Promise<void> {
    if (this._isEnforced) {
      await stopNativeBlocking().catch((error) => {
        console.warn('[BlockingEngine] Failed to stop native blocking:', error);
      });
    }
    this._isBlocking = false;
    this._isEnforced = false;
  }

  isBlocking(): boolean {
    return this._isBlocking;
  }

  isEnforced(): boolean {
    return this._isEnforced;
  }

  getBlockedApps(): string[] {
    return [...this._blockedApps];
  }

  getBlockedAttempts(): number {
    return this._blockedAttempts;
  }

  recordBlockedAttempt(appName: string): void {
    this._blockedAttempts++;
    this._attemptLog.push({ app: appName, time: new Date() });
  }

  reset(): void {
    this._isBlocking = false;
    this._isEnforced = false;
    this._blockedApps = [];
    this._blockedAttempts = 0;
    this._attemptLog = [];
  }
}

// Singleton instance
export const blockingEngine: BlockingEngineInterface = new NativeAwareBlockingEngine();
