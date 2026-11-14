/**
 * Swipe-to-act row wrapper (CONTEXT D-27, UI-SPEC 4, Confirmed Decision 10; REQ ACT-14).
 * Wraps any row in ReanimatedSwipeable with an 88px action zone on each side that
 * carries a word, and (06.2 L02) an optional 16 icon above it. A full swipe commits the action, fires the light
 * tap haptic (hapticLight is hapticTap, 06.2-03) and
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
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Glyph } from '@/ui/icons/Glyph';
import type { IconName } from '@/ui/icons/iconData';

export const SWIPE_ACTION_WIDTH = 88; // UI-SPEC Confirmed Decision 10; the minimum, a longer label grows its zone

const ZONE_PAD = space.gapSm;

/** Zone width for a measured label: never below the minimum, grows to fit the word plus padding. */
export function zoneWidthFor(labelWidth: number): number {
  return Math.max(SWIPE_ACTION_WIDTH, Math.ceil(labelWidth) + 2 * ZONE_PAD);
}

export interface SwipeAction {
  word: string;
  a11yLabel: string;
  tone: 'positive' | 'danger';
  onCommit: () => void;
  /** 06.2 L02: a 16 icon drawn above the word in the word's colour; the word always shows (D-06). */
  icon?: IconName;
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
  /** Label of the screen-reader "activate" action; defaults to accessibilityLabel. */
  activateLabel?: string;
  /** D-63 (03.1): long-press starts select mode. */
  onLongPress?: () => void;
  /** Name of the screen-reader 'select' action; defaults to accessibilityLabel. */
  longPressLabel?: string;
}

function ActionZone({
  action,
  align,
  width,
  onMeasure,
}: {
  action: SwipeAction;
  align: 'left' | 'right';
  width: number;
  onMeasure: (labelWidth: number) => void;
}) {
  const { colors, pairing } = useTheme();
  const backgroundColor = action.tone === 'danger' ? colors.danger : colors.accent;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.zone, { width, backgroundColor, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}
    >
      {action.icon !== undefined ? <Glyph name={action.icon} size={16} color={colors.surface} testID={`swipe-icon-${action.icon}`} /> : null}
      <Text
        numberOfLines={1}
        onTextLayout={(e) => {
          const w = e.nativeEvent.lines[0]?.width;
          if (w !== undefined) onMeasure(w);
        }}
        style={{ ...textRole(pairing, 'label'), color: colors.surface }}
      >
        {action.word}
      </Text>
    </View>
  );
}

export function SwipeRow({ children, left, right, disabled = false, onPress, accessibilityLabel, activateLabel, onLongPress, longPressLabel }: SwipeRowProps) {
  const ref = useRef<SwipeableMethods>(null);
  const [leftZone, setLeftZone] = useState(SWIPE_ACTION_WIDTH);
  const [rightZone, setRightZone] = useState(SWIPE_ACTION_WIDTH);

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
  if (onPress) actions.push({ name: 'activate', label: activateLabel ?? accessibilityLabel ?? 'Open' });
  if (!disabled && onLongPress) actions.push({ name: 'select', label: longPressLabel ?? accessibilityLabel ?? 'Select' });

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
        else if (name === 'select' && !disabled) onLongPress?.();
      }}
    >
      {onPress || onLongPress ? (
        <Pressable onPress={onPress} onLongPress={disabled ? undefined : onLongPress}>
          {children}
        </Pressable>
      ) : (
        children
      )}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={!disabled}
      friction={2}
      leftThreshold={leftZone}
      rightThreshold={rightZone}
      overshootLeft
      overshootRight
      renderLeftActions={
        left ? () => <ActionZone action={left} align="left" width={leftZone} onMeasure={(w) => setLeftZone(zoneWidthFor(w))} /> : undefined
      }
      renderRightActions={
        right ? () => <ActionZone action={right} align="right" width={rightZone} onMeasure={(w) => setRightZone(zoneWidthFor(w))} /> : undefined
      }
      onSwipeableOpen={onSwipeableOpen}
    >
      {body}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  zone: {
    minHeight: space.touchMin,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: ZONE_PAD,
  },
});
