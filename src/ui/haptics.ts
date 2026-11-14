/**
 * The only haptics entry point. 06.2 D-20: one meaning each.
 *
 *   hapticTap        Light impact   saved, answer shown, swipe done.
 *   hapticWarn       Warning        over a cap, short.
 *   hapticMilestone  Success        goal reached, debt cleared, import done, and nothing else.
 *                                   Never for a purchase that "fits".
 *   hapticFailed     Error          a save that really failed.
 *   hapticTick       Selection      choosing a date, switch or answer.
 *
 * No haptic on tab change. Expo SDK 57 dropped the old non-async methods (CLAUDE.md), so only
 * notificationAsync / impactAsync / selectionAsync are used here.
 *
 * D-21 / D-28: every haptic passes through gate(), which reads the Haptics switch
 * (src/ui/hapticsSetting.ts, default ON). The phone's own vibration setting still silences them.
 *
 * Each function returns void and swallows a rejected promise: a missing haptic engine must
 * never break the action it decorates (T-06.2-03-02).
 */
import * as Haptics from 'expo-haptics';

import { getHapticsEnabled } from './hapticsSetting';

function gate(fire: () => Promise<void>): void {
  if (!getHapticsEnabled()) return;
  try {
    fire().catch(() => undefined);
  } catch {
    // A synchronous throw from a missing native module is swallowed the same way.
  }
}

/** Saved, answer shown, swipe done. */
export function hapticTap(): void {
  gate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Over a cap, short. */
export function hapticWarn(): void {
  gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Goal reached, debt cleared, import done. Nothing else. */
export function hapticMilestone(): void {
  gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A save that really failed. */
export function hapticFailed(): void {
  gate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Choosing a date, switch or answer. */
export function hapticTick(): void {
  gate(() => Haptics.selectionAsync());
}

/** @deprecated 06.2 D-20: use hapticTap */
export const hapticLight = hapticTap;
/** @deprecated 06.2 D-20: use hapticTick (the FAB long-press opens a menu of choices; no medium meaning) */
export const hapticMedium = hapticTick;
/** @deprecated 06.2 D-20: use hapticTick */
export const hapticSelection = hapticTick;
/** @deprecated 06.2 D-20: use hapticWarn */
export const hapticWarning = hapticWarn;
/** @deprecated 06.2 D-20: use hapticMilestone */
export const hapticSuccess = hapticMilestone;
