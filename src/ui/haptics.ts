/**
 * The only haptics entry point for Phase 2.2 features (swipe commit, keypad, cap warning,
 * bulk commits). Expo SDK 57 dropped the deprecated `impact()/notification()/selection()`
 * methods (CLAUDE.md), so only the *Async surface is used here. Feature haptics map to
 * UI-SPEC sections 4 (swipe), 8 (keypad / dropdown) and 10 (cap crossed).
 *
 * Each function returns void and swallows a rejected promise: a missing haptic engine must
 * never break the action it decorates.
 */
import * as Haptics from 'expo-haptics';

/** Swipe commit (UI-SPEC 4). */
export function hapticLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Keypad key, dropdown pick (UI-SPEC 8). */
export function hapticSelection(): void {
  Haptics.selectionAsync().catch(() => undefined);
}

/** Category cap crossed (UI-SPEC 10). */
export function hapticWarning(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

/** Bulk commit: clone, paste, mark monthly. */
export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
