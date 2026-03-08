export type BlockingPlatform = 'android' | 'ios' | 'other';

export interface BlockingSupportInput {
  platform: BlockingPlatform;
  hasNativeBlockerModule: boolean;
  accessibilityEnabled: boolean;
  overlayPermission: boolean;
}

export interface BlockingSupport {
  platform: BlockingPlatform;
  hasNativeBlockerModule: boolean;
  canEnforce: boolean;
  requiresSetup: boolean;
  headline: string;
  detail: string;
}

export function describeBlockingSupport(input: BlockingSupportInput): BlockingSupport {
  if (input.platform === 'ios') {
    return {
      platform: 'ios',
      hasNativeBlockerModule: false,
      canEnforce: false,
      requiresSetup: false,
      headline: 'Focus mode only',
      detail: 'This iOS build cannot enforce device-level app blocking in the current Expo and entitlements setup.',
    };
  }

  if (input.platform !== 'android') {
    return {
      platform: input.platform,
      hasNativeBlockerModule: false,
      canEnforce: false,
      requiresSetup: false,
      headline: 'Focus mode only',
      detail: 'Device-level app blocking is not available on this platform.',
    };
  }

  if (!input.hasNativeBlockerModule) {
    return {
      platform: 'android',
      hasNativeBlockerModule: false,
      canEnforce: false,
      requiresSetup: false,
      headline: 'Focus mode only',
      detail: 'This Android build does not include the native blocker module needed for device-level enforcement.',
    };
  }

  if (!input.accessibilityEnabled) {
    return {
      platform: 'android',
      hasNativeBlockerModule: true,
      canEnforce: false,
      requiresSetup: true,
      headline: 'Setup required',
      detail: 'Enable the Android Accessibility Service to enforce app blocking during meals.',
    };
  }

  if (!input.overlayPermission) {
    return {
      platform: 'android',
      hasNativeBlockerModule: true,
      canEnforce: true,
      requiresSetup: true,
      headline: 'Android blocking available',
      detail: 'App blocking can be enforced on this Android build. Grant overlay permission for a full-screen blocker overlay.',
    };
  }

  return {
    platform: 'android',
    hasNativeBlockerModule: true,
    canEnforce: true,
    requiresSetup: false,
    headline: 'Android blocking available',
    detail: 'App blocking can be enforced on this Android build.',
  };
}