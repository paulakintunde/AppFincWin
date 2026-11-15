/**
 * UI-SPEC Design System: the presentational Undo toast (D-31) -- ink background, surface
 * text, radii.toast container, an optional action (e.g. "Undo") and a dismiss control.
 * T-02-19-02: shows only the user's own payee/category name back to themselves; no logging.
 * Purely presentational -- auto-dismiss timing (3.2s ordinary / ~6s destructive, none while a
 * screen reader runs: D-31, `toastDurationMs` in src/state/undoToast.ts) is the caller's
 * concern, not this component's.
 *
 * 06.2-14 (L06 kit, D-15/D-17): at least 48 tall; one row of a 16 icon, the message, one action and Dismiss; a 2 dp
 * time-left bar along the bottom edge that shrinks from the left over the toast's remaining time (no bar when the toast
 * has no timeout). It rises 8 dp and fades in over DURATION.appear, and fades out over DURATION.toastOut when it leaves
 * or is replaced (the host keys it by toast id; the queue in src/state/undoToast.ts is unchanged). With Reduce Motion
 * on: no rise, a quick DURATION.press fade, and the time bar steps once a second instead of moving smoothly.
 *
 * C-CR-02: the container is deliberately NOT `accessible`. On iOS an accessible view becomes
 * a single accessibility element and hides its descendants, so VoiceOver could never reach
 * Undo or Dismiss -- the only undo affordance for deletes and imports. Only the message text
 * is the alert; the controls stay separately focusable. `accessibilityLiveRegion` is
 * Android-only, so iOS gets an explicit announcement on mount / message change instead.
 * The icon and the time bar are hidden from screen readers.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { Glyph } from '@/ui/icons/Glyph';
import type { IconName } from '@/ui/icons/iconData';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { radii } from '@/theme/layout';
import { textRole } from '@/theme/typography';

// UI-SPEC Toast & Sync Line: prototype pill geometry (html 2794).
const TOAST_PAD_V = 13;
const TOAST_PAD_H = 18;
const TOAST_GAP = 14;
// L06: the toast rises 8 dp (14 before 06.2).
const RISE_DISTANCE = 8;
/** L06: the kit's minimum toast height. */
export const TOAST_MIN_HEIGHT = 48;
/** L06: the time-left bar's thickness. */
export const TIME_BAR_HEIGHT = 2;
const TIME_BAR_TRACK_OPACITY = 0.15;
/** Reduce Motion: the time bar steps once a second instead of moving smoothly. */
export const REDUCED_STEP_MS = 1000;
const ICON_SIZE = 16;
const CONTROL_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };
/**
 * DB-12: the Dismiss target is a 48 x 48 dp box around the 12 dp glyph. Negative margins give the
 * box back to the row, so the toast's size and the glyph's place do not change. It reaches 8 dp into
 * the gap on its left (as the old hitSlop did) and the rest to its right, over the toast's own padding.
 */
const DISMISS_TARGET = 48;
const GLYPH = 12;
const DISMISS_LEFT = 8;
const DISMISS_RIGHT = DISMISS_TARGET - GLYPH - DISMISS_LEFT;
const DISMISS_V = (DISMISS_TARGET - GLYPH) / 2;

export interface ToastViewProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  dismissLabel: string;
  /** 'warning' is the amber cap-crossing toast; everything else keeps the ink toast. */
  tone?: 'default' | 'warning';
  /** 06.2-14: a 16 icon before the message, in the surface colour. Decorative: the message carries the meaning. */
  icon?: IconName;
  /** 06.2-14: the toast's full auto-dismiss time in ms. A number draws the time-left bar; null or absent draws none. */
  durationMs?: number | null;
  /** 06.2-14: ms epoch when the toast was first shown, so the bar starts at the time already used. Defaults to mount. */
  shownAt?: number;
  /** 06.2-14: wait this long before rising in (the host passes DURATION.toastOut when this toast replaces another). */
  enterDelayMs?: number;
}

/** The fraction of the toast's time left at `now`, clamped to 0..1. */
export function timeLeftFraction(durationMs: number, shownAt: number, now: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, (durationMs - (now - shownAt)) / durationMs));
}

function TimeLeftBar({ durationMs, shownAt, color }: { durationMs: number; shownAt: number; color: string }) {
  const { reduced } = useMotion();
  // Set to the real time left in the effect below (no clock read during render).
  const left = useSharedValue(1);
  useEffect(() => {
    const now = Date.now();
    left.value = timeLeftFraction(durationMs, shownAt, now);
    if (reduced) {
      const timer = setInterval(() => {
        left.value = timeLeftFraction(durationMs, shownAt, Date.now());
      }, REDUCED_STEP_MS);
      return () => clearInterval(timer);
    }
    const remaining = Math.max(0, durationMs - (now - shownAt));
    left.value = withTiming(0, { duration: remaining, easing: Easing.linear });
    return undefined;
  }, [durationMs, shownAt, reduced, left]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: left.value }] }));
  return (
    <View
      testID="toast-time-bar"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.timeBar}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: TIME_BAR_TRACK_OPACITY }]} />
      <Animated.View testID="toast-time-bar-fill" style={[styles.timeBarFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

export function ToastView({
  message,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel,
  tone = 'default',
  icon,
  durationMs = null,
  shownAt,
  enterDelayMs = 0,
}: ToastViewProps) {
  const { colors, pairing } = useTheme();
  const motion = useMotion();
  // Older suites mock useMotion without `fade`; fall back to the same rule.
  const fade = motion.fade ?? ((ms: number) => (motion.reduced ? DURATION.press : ms));
  const [mountedAt] = useState(() => Date.now());
  // Warning: surface text on warn1 is about 5.9:1 (>= 4.5:1), so the amber toast stays readable.
  const background = tone === 'warning' ? colors.warn1 : colors.ink;
  const messageStyle = { ...textRole(pairing, 'body'), color: colors.surface };
  const actionStyle = { ...textRole(pairing, 'label'), color: colors.surface };

  // L06 rise: 8 dp up plus a fade over DURATION.appear. Reduce Motion: no rise and a quick plain fade (D-17); the fade
  // is kept (ReduceMotion.Never) rather than skipped by the root ReducedMotionConfig.
  const rise = useSharedValue(1);
  const enterMs = fade(DURATION.appear);
  useEffect(() => {
    rise.value = withDelay(
      enterDelayMs,
      withTiming(0, { duration: enterMs, easing: EASING, reduceMotion: ReduceMotion.Never }),
      ReduceMotion.Never
    );
  }, [rise, enterMs, enterDelayMs]);
  const riseDistance = motion.reduced ? 0 : RISE_DISTANCE;
  const riseStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: rise.value * riseDistance }],
  }));
  // L06 leave: a 0.15 s fade when the toast is dismissed or replaced.
  const exiting = FadeOut.duration(fade(DURATION.toastOut)).reduceMotion(ReduceMotion.Never);

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    // The leave fade sits on its own wrapper so it never fights the rise's animated opacity.
    <Animated.View testID="toast-leave" exiting={exiting}>
    <Animated.View testID="toast-rise" style={riseStyle}>
    <View style={[styles.container, { backgroundColor: background, borderRadius: radii.toast }]}>
      {icon ? <Glyph name={icon} size={ICON_SIZE} color={colors.surface} testID={`toast-icon-${icon}`} /> : null}
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.message, messageStyle]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={CONTROL_HIT_SLOP}
          style={styles.control}
        >
          <Text style={actionStyle}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={styles.dismiss}
      >
        <CloseGlyph color={colors.surface} />
      </Pressable>
      {typeof durationMs === 'number' ? (
        <TimeLeftBar durationMs={durationMs} shownAt={shownAt ?? mountedAt} color={colors.surface} />
      ) : null}
    </View>
    </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: TOAST_PAD_V,
    paddingHorizontal: TOAST_PAD_H,
    gap: TOAST_GAP,
  },
  message: {
    flex: 1,
  },
  control: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismiss: {
    width: DISMISS_TARGET,
    height: DISMISS_TARGET,
    marginVertical: -DISMISS_V,
    marginLeft: -DISMISS_LEFT,
    marginRight: -DISMISS_RIGHT,
    paddingLeft: DISMISS_LEFT,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  // Inset by the corner radius so the 2 dp bar sits inside the rounded corners; the container itself does not clip,
  // so the Dismiss target's negative margins still reach past its padding.
  timeBar: {
    position: 'absolute',
    left: radii.toast,
    right: radii.toast,
    bottom: 0,
    height: TIME_BAR_HEIGHT,
    overflow: 'hidden',
  },
  timeBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    transformOrigin: 'left',
  },
});
