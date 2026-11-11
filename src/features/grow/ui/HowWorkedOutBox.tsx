// 06-21: the always-visible "How it was worked out" box. No collapse; the lines arrive already translated, in order.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { GrowGlyph } from './GrowGlyph';

export interface HowWorkedOutBoxProps {
  lines: readonly string[];
}

export function HowWorkedOutBox({ lines }: HowWorkedOutBoxProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="how-worked-out" style={[styles.box, { backgroundColor: colors.fill1 }]}>
      <View style={styles.head}>
        <GrowGlyph name="view" color={colors.inkMuted} size={18} />
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
          {t('grow.calc.worked')}
        </Text>
      </View>
      {lines.map((line, i) => (
        <Text key={i} style={{ ...textRole(pairing, 'body'), fontSize: fontSize.label, color: colors.inkDim }}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.card, padding: space.cardPad, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
