/** D-24: the combine pill, a switch. Visual 32, hit 44, state dot plus words plus accessibilityState. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { hapticSelection } from '@/ui/haptics';
import { useInfoSheet } from './useInfoSheet';

export interface CombineToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  /** D-95: on the dark card -- surface at .12 pill, surface text, a surface dot when on (the accent fails 3:1 on ink). */
  dark?: boolean;
}

const HIT = 44;
const VISUAL = 32;
const DOT = 10;

export function CombineToggle({ value, onChange, dark = false }: CombineToggleProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // D-70: the explanation opens on long-press and as an accessibility action; a tap still toggles.
  const info = useInfoSheet('combined');
  return (
    <>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={t('decide.depth.combined.pillA11y')}
        accessibilityState={{ checked: value }}
        accessibilityActions={[info.aboutAction]}
        onAccessibilityAction={info.onAccessibilityAction}
        onLongPress={info.open}
        onPress={() => {
          hapticSelection();
          onChange(!value);
        }}
        style={({ pressed }) => [styles.hit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={[styles.pill, { backgroundColor: dark ? 'transparent' : colors.fill1 }, dark && styles.clip]}>
          {dark ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
            />
          ) : null}
          <View
            testID="combine-dot"
            style={[styles.dot, { backgroundColor: dark ? (value ? colors.surface : colors.inkSoft2) : value ? colors.accent : colors.line4 }]}
          />
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: dark ? colors.surface : colors.inkDim }}>
            {t('decide.depth.combined.pill')}
          </Text>
        </View>
      </Pressable>
      {info.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: HIT, minWidth: HIT, alignSelf: 'flex-start', justifyContent: 'center' },
  pill: {
    minHeight: VISUAL,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
    paddingHorizontal: space.gapMd,
    borderRadius: radii.pill,
  },
  clip: { overflow: 'hidden' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
