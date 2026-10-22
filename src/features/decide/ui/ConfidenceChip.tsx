/** D-28: the confidence chip. Words carry the strength; colour only backs them. A 44 hit button that opens the reasons sheet. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY, warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';

export type ConfidenceLevel = 'strong' | 'fair' | 'rough';

export interface ConfidenceChipProps {
  level: ConfidenceLevel;
  onPress: () => void;
}

const HIT = 44;
const CHIP_PAD_V = 4;

export function ConfidenceChip({ level, onPress }: ConfidenceChipProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = t(`decide.depth.confidence.${level}`);
  let background: string = colors.fill1;
  let textColor: string = colors.inkDim;
  if (level === 'rough') {
    background = warnTint;
    textColor = colors.warn1;
  } else if (level === 'strong') {
    textColor = colors.accent;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('decide.depth.confidence.a11y', { strength: label })}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View style={[styles.chip, { backgroundColor: background }]}>
        {level === 'strong' ? (
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: HIT, minWidth: HIT, alignSelf: 'flex-start', justifyContent: 'center' },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.gapMd,
    paddingVertical: CHIP_PAD_V,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
});
