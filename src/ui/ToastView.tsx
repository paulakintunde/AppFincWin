/**
 * UI-SPEC Design System: the presentational Undo toast (D-31) -- ink background, surface
 * text, radii.pill container, an optional action (e.g. "Undo") and a dismiss control.
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
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface ToastViewProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}

export function ToastView({ message, actionLabel, onAction, onDismiss, dismissLabel }: ToastViewProps) {
  const { colors, pairing } = useTheme();
  const messageStyle = { ...textRole(pairing, 'body'), color: colors.surface };
  const actionStyle = { ...textRole(pairing, 'label'), color: colors.surface };

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View style={[styles.container, { backgroundColor: colors.ink, borderRadius: radii.pill }]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.message, messageStyle]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={styles.control}
        >
          <Text style={actionStyle}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={styles.control}
      >
        <CloseGlyph color={colors.surface} />
      </Pressable>
    </View>
  );
}

/** Phase 0 convention: a small rotated-border glyph, never an icon font. */
function CloseGlyph({ color }: { color: string }) {
  return (
    <View style={styles.closeGlyph}>
      <View style={[styles.closeBar, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.closeBar, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.pillPadV,
    paddingHorizontal: space.cardPad,
    gap: space.gapMd,
  },
  message: {
    flex: 1,
  },
  control: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    width: 12,
    height: 12,
  },
  closeBar: {
    position: 'absolute',
    top: 5,
    left: 0,
    width: 12,
    height: 2,
    borderRadius: 1,
  },
});
