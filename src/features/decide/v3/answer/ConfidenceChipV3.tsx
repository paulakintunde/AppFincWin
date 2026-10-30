/**
 * 05.3-25 (UI-SPEC Hero, D-57): the second chip on the answer. Hidden when the answer is firm. Reads "Fair", "Rough", or
 * "Rough, from your figures" when the figures were typed in (warnTint / warn1). Words carry the strength; colour backs them.
 * Pressing it opens ConfidenceSheetV3. The chip is its visible height; hit slop brings the target to 44.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Confidence } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { InfoGlyph } from '@/features/decide/ui/InfoButton';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { confidenceChip } from '../model/confidence';

export interface ConfidenceChipV3Props {
  confidence: Confidence;
  onPress: () => void;
}

const CHIP_PAD_V = 4;
// the chip is about 26 high; with 9 of hit slop each side the target is the 44 floor
const CHIP_MIN_HEIGHT = 26;
const HIT_SLOP = { top: 9, bottom: 9, left: 9, right: 9 } as const;

export function ConfidenceChipV3({ confidence, onPress }: ConfidenceChipV3Props): React.JSX.Element | null {
  const t = useT() as (key: string, params?: Record<string, string>) => string;
  const { colors, pairing } = useTheme();
  const model = confidenceChip(confidence);
  if (!model.show) return null;
  const label = t(model.labelKey);
  const warn = model.tone === 'warn';
  const background: string = warn ? warnTint : colors.fill1;
  const textColor: string = warn ? colors.warn1 : colors.inkDim;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('decide.v3.ui.confidence.a11y', { strength: label })}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => [styles.hit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View style={[styles.chip, { backgroundColor: background }]}>
        <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: textColor }}>
          {label}
        </Text>
        <InfoGlyph size={12} color={textColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignSelf: 'flex-start', minHeight: CHIP_MIN_HEIGHT, justifyContent: 'center' },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.gapMd,
    paddingVertical: CHIP_PAD_V,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
});
