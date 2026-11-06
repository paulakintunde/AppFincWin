/** UI-SPEC Color: warning cards. Hard (month, owe) use danger tints; soft (cash, dsr, inv) use the
 * ochre tint with warn1 text (D-05, D-06). Read as one unit, with words, never colour alone. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';

const WARNING_BORDER = 1.5; // UI-SPEC warning card 1.5px border

export interface WarningCardProps {
  tone: 'hard' | 'soft';
  title: string;
  value: string;
  body: string[];
  /** D-94: the whole card read with each amount spoken by currency name; defaults to the visible text. */
  a11yLabel?: string;
}

export function WarningCard({ tone, title, value, body, a11yLabel }: WarningCardProps) {
  const { colors, pairing } = useTheme();
  const hard = tone === 'hard';
  const background = hard ? colors.dangerTint3 : warnTint;
  const border = hard ? colors.dangerTint2 : colors.line2;
  const textColor = hard ? colors.danger : colors.warn1;
  return (
    <View
      accessible
      accessibilityLabel={a11yLabel ?? `${title}, ${value}. ${body.join(' ')}`}
      style={[styles.card, { backgroundColor: background, borderColor: border }]}
    >
      <View style={styles.head}>
        <Text style={{ ...textRole(pairing, 'label'), color: textColor, flexShrink: 1 }}>{title}</Text>
        <Text scale="capped" style={{ ...textRole(pairing, 'sheetTitle'), color: textColor }}>{value}</Text>
      </View>
      {body.map((line, i) => (
        // IN-D02: body lines can repeat, so the key carries the position too
        <Text key={`${i}-${line}`} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: WARNING_BORDER,
    padding: space.cardPad,
    gap: space.gapSm,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.gapMd },
});
