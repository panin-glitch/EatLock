/**
 * Unit tests for blocker capability classification.
 *
 * Run: npx tsx src/services/__tests__/blockingSupport.test.ts
 */

declare const process: { exit(code?: number): never };

import { describeBlockingSupport } from '../blockingSupport';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, details?: unknown) {
  if (condition) {
    passed++;
    return;
  }

  failed++;
  console.error(`FAIL: ${label}`);
  if (details !== undefined) {
    console.error(details);
  }
}

{
  const support = describeBlockingSupport({
    platform: 'ios',
    hasNativeBlockerModule: false,
    accessibilityEnabled: false,
    overlayPermission: false,
  });
  assert('ios is focus mode only', support.canEnforce === false, support);
  assert('ios has no native blocker module', support.hasNativeBlockerModule === false, support);
}

{
  const support = describeBlockingSupport({
    platform: 'android',
    hasNativeBlockerModule: false,
    accessibilityEnabled: false,
    overlayPermission: false,
  });
  assert('android without module is unsupported', support.canEnforce === false, support);
  assert('android without module does not require setup', support.requiresSetup === false, support);
}

{
  const support = describeBlockingSupport({
    platform: 'android',
    hasNativeBlockerModule: true,
    accessibilityEnabled: false,
    overlayPermission: false,
  });
  assert('android without accessibility needs setup', support.requiresSetup === true, support);
  assert('android without accessibility cannot enforce', support.canEnforce === false, support);
}

{
  const support = describeBlockingSupport({
    platform: 'android',
    hasNativeBlockerModule: true,
    accessibilityEnabled: true,
    overlayPermission: true,
  });
  assert('android with native support can enforce', support.canEnforce === true, support);
  assert('android with native support exposes setup complete', support.requiresSetup === false, support);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);