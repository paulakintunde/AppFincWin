// D-56 / D-57: round header icon button. 36pt visible circle inside a 44pt hit area; the Filter
// variant carries an accent count badge. The badge is hidden from screen readers; the caller's
// label carries the count ("Filter, 2 active") so state is never shape-only.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, size, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { HeaderGlyph, type HeaderGlyphName } from './HeaderGlyphs';

const BADGE_OFFSET = -2; // UI-SPEC declared one-off exception, not a token
const BADGE_PAD_H = 4; // keeps "9+" inside the pill

export interface HeaderIconButtonProps {
  glyph: HeaderGlyphName;
  label: string;
  onPress: () => void;
  badge?: number;
  buttonRef?: React.Ref<View>;
  testID?: string;
}

export function HeaderIconButton({
  glyph,
  label,
  onPress,
  badge,
  buttonRef,
  testID,
}: HeaderIconButtonProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      ref={buttonRef}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(space.touchMin - size.backCompact) / 2}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, { backgroundColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <HeaderGlyph name={glyph} color={colors.ink} />
      {badge !== undefined && badge > 0 ? (
        <View
          testID="header-icon-badge"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.badge, { backgroundColor: colors.accent }]}
        >
          <Text
            scale="capped"
            style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.surface }}
          >
            {badge > 9 ? '9+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: size.backCompact,
    height: size.backCompact,
    borderRadius: size.backCompact / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: BADGE_OFFSET,
    right: BADGE_OFFSET,
    minWidth: size.filterBadge,
    height: size.filterBadge,
    borderRadius: radii.pill,
    paddingHorizontal: BADGE_PAD_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
