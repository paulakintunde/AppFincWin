// D-10: the month's paid In / Out / Net, with Still to come as a separate figure. Totals are
// computed upstream by the engine (transfers excluded). Lines with no home-currency figure
// are counted and labelled, never estimated (T-02-22-01).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MonthTotals } from '@/engine/activity';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface MonthTotalsBarProps {
  totals: MonthTotals;
  homeCurrency: string;
  formatter: MoneyFormatter;
}

export function MonthTotalsBar({ totals, homeCurrency, formatter }: MonthTotalsBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = (amount: number) => formatter.formatMoney(money(amount, homeCurrency));

  const cells: { key: string; label: string; value: string }[] = [
    { key: 'in', label: t('activity.totals.in'), value: fmt(totals.paidIn) },
    { key: 'out', label: t('activity.totals.out'), value: fmt(totals.paidOut) },
    { key: 'net', label: t('activity.totals.net'), value: fmt(totals.net) },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {cells.map((c) => (
          <View key={c.key} style={styles.cell} accessible accessibilityLabel={`${c.label}, ${c.value}`}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{c.label}</Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{c.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.totals.stillToCome')}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{fmt(totals.stillToCome)}</Text>
      </View>
      {totals.unconvertedCount > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('activity.totals.unconverted', { count: totals.unconvertedCount })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.gapSm,
    paddingVertical: space.gapSm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.gapMd,
  },
  cell: {
    flex: 1,
  },
});
