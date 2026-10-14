/**
 * The only haptics entry point for Phase 2.2 features and the Phase 3 shell (D-18: light on FAB
 * press, medium on the long-press menu, selection tick on drag-close, nothing on tab change) (swipe commit, keypad, cap warning,
 * bulk commits). Expo SDK 57 dropped the deprecated non-async haptic methods
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

/** FAB long-press opens the quick menu (03 D-18). */
export function hapticMedium(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
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
