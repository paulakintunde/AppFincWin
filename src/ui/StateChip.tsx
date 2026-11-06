/** UI-SPEC Color: the state chip on a check. Words always carry the state; colour only backs them. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { ACCENT_TINT_OPACITY, warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';

export type StateChipTone = 'fits' | 'adjust' | 'waiting' | 'no' | 'missing' | 'draft' | 'passed';

export interface StateChipProps {
  tone: StateChipTone;
  label: string;
  /** D-95: on the dark card -- surface at .12 fill and surface text (dangerTint2 for 'no'); the words carry the state. */
  onInk?: boolean;
}

const CHIP_PAD_V = 4; // UI-SPEC state chip vertical padding

export function StateChip({ tone, label, onInk = false }: StateChipProps) {
  const { colors, pairing } = useTheme();
  if (onInk) {
    return (
      <View style={styles.chip}>
        <View
          testID="dark-tint"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
        />
        <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: tone === 'no' ? colors.dangerTint2 : colors.surface }}>
          {label}
        </Text>
      </View>
    );
  }
  let background: string = colors.fill1;
  let textColor: string = colors.inkDim;
  if (tone === 'adjust' || tone === 'waiting') {
    background = warnTint;
    textColor = colors.warn1;
  } else if (tone === 'no') {
    background = colors.dangerTint2;
    textColor = colors.danger;
  } else if (tone === 'fits') {
    textColor = colors.accent;
  }
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      {tone === 'fits' ? (
        <View
          testID="accent-tint"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill },
          ]}
        />
      ) : null}
      <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.gapMd,
    paddingVertical: CHIP_PAD_V,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
});
