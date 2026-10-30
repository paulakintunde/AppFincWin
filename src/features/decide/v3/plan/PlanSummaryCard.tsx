// 05.3-28 (DSV-09): the dark plan summary, the one dark area on the whole-plan screen. One a11y group; the payment figure
// is one line (rule N) and capped at 1.3x; the count and end-date lines wrap.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fontSize } from '@/theme/typography';

export interface PlanSummaryCardProps {
  caption: string;
  payment: string;
  perMonthEnds: string;
  running: string | null;
  a11yLabel: string;
}

const CARD_PAD = 22;

export function PlanSummaryCard({ caption, payment, perMonthEnds, running, a11yLabel }: PlanSummaryCardProps): React.JSX.Element {
  const { colors, fonts } = useTheme();
  const line = { fontFamily: fonts.body[500], fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, color: colors.shell };
  return (
    <View accessible accessibilityLabel={a11yLabel} style={[styles.card, { backgroundColor: colors.ink }]}>
      <Text style={{ fontFamily: fonts.body[700], fontSize: fontSize.label, lineHeight: fontSize.label * 1.4, color: colors.inkSoft2 }}>{caption}</Text>
      <Text
        scale="capped"
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        style={{ fontFamily: fonts.body[500], fontSize: fontSize.amountDisplay, letterSpacing: fontSize.amountDisplay * -0.04, color: colors.surface }}
      >
        {payment}
      </Text>
      <Text style={line}>{perMonthEnds}</Text>
      {running === null ? null : <Text style={line}>{running}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: CARD_PAD, gap: 6 },
});
