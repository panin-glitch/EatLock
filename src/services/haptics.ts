import * as Haptics from 'expo-haptics';

export function triggerLightHaptic(enabled = true): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
