/**
 * 06.1-16 (UX-42): the label/value lines with a bold total, shared by the sale sheet (D45), D12's Up front card and D13's
 * total. One summary node reads every line and the total in order to a screen reader. Amounts are tabular and never truncate.
 * Negative totals growing downward (UX-30) are not StackedBar's job (it is a horizontal share bar); a negative total here is
 * a line with a minus sign.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';

export interface WaterfallLine {
  label: string;
  /** Minor units, never negative: the sign says which way it goes. */
  amount: number;
  sign: '+' | '-' | '';
}

export interface WaterfallCardProps {
  lines: readonly WaterfallLine[];
  total: { label: string; amount: number };
  currency: string;
  testID?: string;
}

const MINUS = '−';

export function WaterfallCard({ lines, total, currency, testID = 'waterfall-card' }: WaterfallCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const show = (n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) });
  const speak = (n: number): string => fmt.formatMoneyA11y({ amount: minorUnits(n), currency: currencyCode(currency) });
  const signed = (l: WaterfallLine): string => `${l.sign === '-' ? MINUS : l.sign === '+' ? '+' : ''}${show(l.amount)}`;

  const spoken = [
    ...lines.map((l) => t('decide.screens.sheetsCosts.waterfall.sumA11y', { label: l.label, total: `${l.sign === '-' ? MINUS : ''}${speak(l.amount)}` })),
    t('decide.screens.sheetsCosts.waterfall.sumA11y', { label: total.label, total: speak(total.amount) }),
  ].join('. ');

  const body = { ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums' as const] };
  const strong = { ...textRole(pairing, 'bodyStrong'), color: colors.ink, fontVariant: ['tabular-nums' as const] };

  return (
    <View testID={testID} accessible accessibilityRole="summary" accessibilityLabel={spoken} style={[styles.card, { backgroundColor: colors.fill6 }]}>
      {lines.map((l, i) => (
        <View key={`${l.label}-${i}`} style={styles.row}>
          <Text style={[body, styles.label]}>{l.label}</Text>
          <Text style={body}>{signed(l)}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.total, { borderTopColor: colors.line4 }]}>
        <Text style={[strong, styles.label]}>{total.label}</Text>
        <Text style={strong}>{show(total.amount)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.gapMd, gap: space.gapSm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  label: { flex: 1, flexShrink: 1 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.gapSm },
});
