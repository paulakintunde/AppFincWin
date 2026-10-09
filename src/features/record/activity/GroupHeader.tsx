// A group header in the Activity list (ACT-06..ACT-08): label left, count, signed net right.
// The net comes from the engine's netOf via the item; nothing is summed here.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { money } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { ActivityItem } from './activitySections';

export interface GroupHeaderProps {
  item: Extract<ActivityItem, { type: 'group' }>;
  month: string;
  homeCurrency: string;
  formatter: MoneyFormatter;
}

function shortMonth(month: string, locale: string): string {
  const [y, m] = month.split('-') as [string, string];
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
}

export function GroupHeader({ item, month, homeCurrency, formatter }: GroupHeaderProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label =
    item.kind === 'day'
      ? formatter.formatDate(item.day as string, 'short')
      : item.kind === 'week'
        ? t('activity.group.week', { n: item.week ?? 0 })
        : t(item.kind === 'in' ? 'activity.group.in' : 'activity.group.out');
  const range =
    item.kind === 'week' && item.range !== undefined
      ? t('activity.group.weekRange', { month: shortMonth(month, formatter.locale), from: item.range.from, to: item.range.to })
      : null;
  const net = formatter.formatMoney(money(item.net, homeCurrency));
  const netText = item.net > 0 ? `+${net}` : net;
  const spoken = range === null ? label : `${label}, ${range}`;
  const labelRole = textRole(pairing, 'label');

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t('activity.group.a11y', { label: spoken, count: item.count, amount: netText })}
      style={styles.row}
    >
      <View style={styles.left}>
        <Text style={{ ...labelRole, color: colors.inkMuted }}>{label}</Text>
        {range !== null ? <Text style={{ ...labelRole, color: colors.inkFaint }}>{range}</Text> : null}
        <Text style={{ ...labelRole, color: colors.inkFaint }}>{t('activity.count', { count: item.count })}</Text>
      </View>
      <View style={styles.right}>
        <Text style={{ ...labelRole, color: item.kind === 'in' && item.net > 0 ? colors.accent : colors.ink }}>{netText}</Text>
        {item.unconvertedCount > 0 ? (
          <Text style={{ ...labelRole, color: colors.inkFaint }}>
            {t('activity.group.unconverted', { count: item.unconvertedCount })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.gapMd,
    paddingTop: space.groupGap,
    paddingBottom: space.gapSm,
  },
  left: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.gapSm },
  right: { alignItems: 'flex-end' },
});
