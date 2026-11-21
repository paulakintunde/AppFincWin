// 08.1-14 (D-07, UI-SPEC section 3): the account goes below zero within the 90 days even without this purchase. One row in its own
// `tight` block (#8A5A1B on #FBEFD6), directly under the verdict card and before the facts: the stateTight glyph, the badge word
// "Warning", then the engine's below_zero_without sentence. It never changes the verdict or its colour, has no animation of its own
// (it rises with the verdict card) and no haptic (it is not an event). Never colour alone: the glyph and the word carry it.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';

/** The engine fact this line says (FactLines skips it, so it is said once). */
export const BELOW_ZERO_FACT = 'below_zero_without';

export interface BelowZeroLineProps {
  /** The filled below_zero_without sentence ("Your account goes below $0.00 on Dec 14, 2026 even without this."). */
  text: string;
}

export function BelowZeroLine({ text }: BelowZeroLineProps) {
  const t = useT();
  const { pairing } = useTheme();
  const tone = stateColors.tight;
  return (
    <View
      testID="answer-below-zero"
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('decide.screens.answer.belowZero.a11y', { sentence: text })}
      style={[styles.block, { backgroundColor: tone.tint }]}
    >
      <View style={styles.badge}>
        <Glyph name="stateTight" size={16} color={tone.color} />
        <Text style={{ ...textRole(pairing, 'label'), color: tone.color }}>{t('decide.screens.answer.belowZero.badge')}</Text>
      </View>
      <Text style={{ ...textRole(pairing, 'body'), color: tone.color }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { padding: space.cardPad, borderRadius: radii.card / 2, gap: step.hair },
  badge: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
});
