// ACT-17, CONTEXT D-26, UI-SPEC 14: the account's pending split. Coming in, Going out and the
// balance after pending, all from the engine's pendingSplit over the server's pending sums.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useFxLatest } from '@/data/queries/fxLatest';
import { projectionHomeAmount } from '@/data/queries/homeAmount';
import { pendingSplit } from '@/engine/accounts';
import { currencyExponent, money } from '@/engine/money';
import { formatMonthLabel } from '@/features/record/activity/MonthSwitcher';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface AccountDetailRowsProps {
  account: AccountRow;
  balance: AccountBalanceView | undefined;
  split: { pendingIn: string; pendingOut: string; pendingCount: number } | undefined;
  /** The household horizon month ('YYYY-MM') or null when none is set. */
  horizonMonth: string | null;
}

/** The later of next month and the horizon month (D-26). */
function labelMonth(today: string, horizonMonth: string | null): string {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return horizonMonth !== null && horizonMonth > next ? horizonMonth : next;
}

export function AccountDetailRows({ account, balance, split, horizonMonth }: AccountDetailRowsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const rates = useFxLatest().data;

  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const fmtIn = (code: string) => (minor: number) => formatter.formatMoney(money(minor, code), { exponent: exponentFor(code) });
  const fmt = fmtIn(account.currency);

  const paid = balance && !balance.overflow ? balance.balance : null;
  const result = pendingSplit({
    balance: paid,
    pendingIn: split?.pendingIn ?? '0',
    pendingOut: split?.pendingOut ?? '0',
  });
  const pendingCount = split?.pendingCount ?? 0;
  const dash = t('accounts.detail.dash');

  let currencyText: string = t('accounts.detail.currencyHome', { code: account.currency });
  if (account.currency !== rc.homeCurrency) {
    const home = paid !== null ? projectionHomeAmount(paid, account.currency, rc.homeCurrency, rates ?? []) : null;
    currencyText =
      home !== null
        ? t('accounts.detail.currencyForeign', { code: account.currency, home: fmtIn(rc.homeCurrency)(home), homeCode: rc.homeCurrency })
        : `${account.currency} · ${t('accounts.inHomeWaiting')}`;
  }

  const monthName = formatMonthLabel(labelMonth(rc.today, horizonMonth), formatter.locale).split(' ')[0] as string;
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const body = textRole(pairing, 'body');
  const afterColor = result.after !== null && result.after < 0 ? colors.danger : colors.accent;

  const rows: { key: string; label: string; value: string; color: string }[] = [
    { key: 'currency', label: t('accounts.detail.currency'), value: currencyText, color: colors.ink },
    {
      key: 'in',
      label: t('accounts.detail.comingIn'),
      value: result.comingIn !== null && result.comingIn !== 0 ? fmt(result.comingIn) : dash,
      color: result.comingIn ? colors.accent : colors.inkMuted,
    },
    {
      key: 'out',
      label: t('accounts.detail.goingOut'),
      value: result.goingOut !== null && result.goingOut !== 0 ? fmt(result.goingOut) : dash,
      color: result.goingOut ? colors.danger : colors.inkMuted,
    },
    {
      key: 'after',
      label: t('accounts.detail.afterPending', { month: monthName }),
      value: result.after !== null ? fmt(result.after) : dash,
      color: result.after !== null ? afterColor : colors.inkMuted,
    },
    {
      key: 'statement',
      label: t('accounts.detail.onStatement'),
      value: paid !== null ? fmt(paid) : dash,
      color: colors.ink,
    },
    {
      key: 'notTicked',
      label: t('accounts.detail.notTicked'),
      value: pendingCount > 0 ? t('accounts.detail.lines', { count: pendingCount }) : t('accounts.detail.none'),
      color: colors.ink,
    },
  ];

  return (
    <View style={styles.block}>
      {rows.map((r) => (
        <View key={r.key} style={styles.row} accessible accessibilityLabel={`${r.label}, ${r.value}`}>
          <Text style={label}>{r.label}</Text>
          <Text style={{ ...body, color: r.color }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.gapSm },
});
