/**
 * Swipe-to-act row wrapper (CONTEXT D-27, UI-SPEC 4, Confirmed Decision 10; REQ ACT-14).
 * Wraps any row in ReanimatedSwipeable with an 88px action zone on each side that
 * carries a word, not an icon. A full swipe commits the action, fires hapticLight and
 * closes the row. Disabled in bulk-select mode. Every swipe action is also exposed as
 * an accessibility action, so the gesture is never the only route. Phase 3 adopts this.
 *
 * Direction semantics (RNGH 2.32, verified in ReanimatedSwipeable.tsx): onSwipeableOpen
 * receives 'right' when the LEFT actions opened (row dragged to the right) and 'left'
 * when the RIGHT actions opened. `left` here is the action revealed by swiping right,
 * `right` the action revealed by swiping left, so the mapping is crossed explicitly.
 *
 * Reduced motion: the library's spring is the only motion; no extra animation is added.
 */
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';

export const SWIPE_ACTION_WIDTH = 88; // UI-SPEC Confirmed Decision 10

export interface SwipeAction {
  word: string;
  a11yLabel: string;
  tone: 'positive' | 'danger';
  onCommit: () => void;
}

export interface SwipeRowProps {
  children: React.ReactNode;
  /** Revealed by swiping right. */
  left?: SwipeAction;
  /** Revealed by swiping left. */
  right?: SwipeAction;
  /** Bulk-select mode: no swiping. */
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

function ActionZone({ action, align }: { action: SwipeAction; align: 'left' | 'right' }) {
  const { colors, pairing } = useTheme();
  const backgroundColor = action.tone === 'danger' ? colors.danger : colors.accent;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.zone, { backgroundColor, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{action.word}</Text>
    </View>
  );
}

export function SwipeRow({ children, left, right, disabled = false, onPress, accessibilityLabel }: SwipeRowProps) {
  const ref = useRef<SwipeableMethods>(null);

  const commit = useCallback((action: SwipeAction | undefined) => {
    if (!action) return;
    hapticLight();
    action.onCommit();
    ref.current?.close();
  }, []);

  const onSwipeableOpen = useCallback(
    (direction: 'left' | 'right') => {
      // 'right' = left actions opened; 'left' = right actions opened.
      commit(direction === 'right' ? left : right);
    },
    [commit, left, right],
  );

  const actions: { name: string; label: string }[] = [];
  if (!disabled && left) actions.push({ name: 'left', label: left.a11yLabel });
  if (!disabled && right) actions.push({ name: 'right', label: right.a11yLabel });
  if (onPress) actions.push({ name: 'activate', label: accessibilityLabel ?? 'Open' });

  const body = (
    <View
      accessible={actions.length > 0}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name === 'left') commit(left);
        else if (name === 'right') commit(right);
        else if (name === 'activate') onPress?.();
      }}
    >
      {onPress ? <Pressable onPress={onPress}>{children}</Pressable> : children}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={!disabled}
      friction={2}
      leftThreshold={SWIPE_ACTION_WIDTH}
      rightThreshold={SWIPE_ACTION_WIDTH}
      overshootLeft
      overshootRight
      renderLeftActions={left ? () => <ActionZone action={left} align="left" /> : undefined}
      renderRightActions={right ? () => <ActionZone action={right} align="right" /> : undefined}
      onSwipeableOpen={onSwipeableOpen}
    >
      {body}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  zone: {
    width: SWIPE_ACTION_WIDTH,
    minHeight: space.touchMin,
    justifyContent: 'center',
    paddingHorizontal: space.cardPad,
  },
});
