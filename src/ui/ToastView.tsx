/**
 * UI-SPEC Design System: the presentational Undo toast (D-31) -- ink background, surface
 * text, radii.toast container, an optional action (e.g. "Undo") and a dismiss control.
 * T-02-19-02: shows only the user's own payee/category name back to themselves; no logging.
 * Purely presentational -- auto-dismiss timing (3.2s ordinary / ~6s destructive, none while a
 * screen reader runs: D-31, `toastDurationMs` in src/state/undoToast.ts) is the caller's
 * concern, not this component's.
 *
 * C-CR-02: the container is deliberately NOT `accessible`. On iOS an accessible view becomes
 * a single accessibility element and hides its descendants, so VoiceOver could never reach
 * Undo or Dismiss -- the only undo affordance for deletes and imports. Only the message text
 * is the alert; the controls stay separately focusable. `accessibilityLiveRegion` is
 * Android-only, so iOS gets an explicit announcement on mount / message change instead.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION } from '@/theme/motion';
import { radii } from '@/theme/layout';
import { textRole } from '@/theme/typography';

// UI-SPEC Toast & Sync Line: prototype pill geometry (html 2794).
const TOAST_PAD_V = 13;
const TOAST_PAD_H = 18;
const TOAST_GAP = 14;
const RISE_DISTANCE = 14;
const CONTROL_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

export interface ToastViewProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  dismissLabel: string;
  /** 'warning' is the amber cap-crossing toast; everything else keeps the ink toast. */
  tone?: 'default' | 'warning';
}

export function ToastView({ message, actionLabel, onAction, onDismiss, dismissLabel, tone = 'default' }: ToastViewProps) {
  const { colors, pairing } = useTheme();
  // Warning: surface text on warn1 is about 5.9:1 (>= 4.5:1), so the amber toast stays readable.
  const background = tone === 'warning' ? colors.warn1 : colors.ink;
  const messageStyle = { ...textRole(pairing, 'body'), color: colors.surface };
  const actionStyle = { ...textRole(pairing, 'label'), color: colors.surface };

  // fw-rise: 14px up plus a fade, 220ms plain ease; ReducedMotionConfig makes it instant (D-21).
  const rise = useSharedValue(1);
  useEffect(() => {
    rise.value = withTiming(0, { duration: DURATION.entrance, easing: Easing.ease });
  }, [rise]);
  const riseStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: rise.value * RISE_DISTANCE }],
  }));

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <Animated.View testID="toast-rise" style={riseStyle}>
    <View style={[styles.container, { backgroundColor: background, borderRadius: radii.toast }]}>
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
        hitSlop={CONTROL_HIT_SLOP}
        style={styles.control}
      >
        <CloseGlyph color={colors.surface} />
      </Pressable>
    </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
