// An account's balance block (D-10, D-49): 'Balance now' in the account's own currency with
// the minus sign always visible, the standing sentence beneath it, other-currency subtotals,
// the still-to-come figure and, for a foreign account, an approximate home figure with the
// rate's date. A negative balance figure is danger (2026-10-07 amendment); its standing sentence
// stays the D-49 copy in warn1 / muted.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AccountRow } from '@/db/rows';
import type { AccountBalanceView } from '@/data/queries/activity';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useFxLatest } from '@/data/queries/fxLatest';
import { projectionHomeAmount } from '@/data/queries/homeAmount';
import { currencyExponent, money } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { RateAttribution } from '@/ui/RateAttribution';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { standingText, type StandingLine } from './standingText';

export interface AccountBalanceBlockProps {
  account: AccountRow;
  balance: AccountBalanceView | undefined;
  homeCurrency: string;
  /** Lists show the figure compact; the detail screen shows the full block. */
  compact?: boolean;
}

/**
 * S-WR-14: the balance and standing as one spoken phrase ("−£25.00, Overdrawn by £25.00..."),
 * so a list card's accessibility label carries what the block shows. Null without a balance.
 */
export function useBalanceSummary(account: AccountRow, balance: AccountBalanceView | undefined): string | null {
  const t = useT();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  if (!balance) return null;
  const exponent = options.find((o) => o.code === account.currency)?.exponent ?? currencyExponent(account.currency);
  const fmt = (minor: number) => formatter.formatMoney(money(minor, account.currency), { exponent });
  if (balance.overflow || balance.balance === null) return t('accounts.balanceNow');
  const line = standingText(balance.standing, fmt);
  const sentence = line ? (t as unknown as (k: string, o: Record<string, string>) => string)(line.key, line.params) : null;
  return [fmt(balance.balance), sentence].filter((p): p is string => p !== null).join(', ');
}

export function AccountBalanceBlock({ account, balance, homeCurrency, compact = false }: AccountBalanceBlockProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const rates = useFxLatest().data;

  // The key set is closed (StandingKey) but a union of keys defeats the typed overloads of t().
  const sentenceOf = (l: StandingLine): string => (t as unknown as (k: string, o: Record<string, string>) => string)(l.key, l.params);
  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const fmtIn = (code: string) => (minor: number) => formatter.formatMoney(money(minor, code), { exponent: exponentFor(code) });
  const fmt = fmtIn(account.currency);

  const line = useMemo(
    () => (balance ? standingText(balance.standing, fmt) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balance, formatter, options, account.currency]
  );

  if (!balance) return null;

  const overflow = balance.overflow || balance.balance === null;
  const negative = balance.balance !== null && balance.balance < 0;
  // 2026-10-07 amendment (supersedes the D-49 colour narrowing for the figure only): a negative
  // balance is danger. The standing sentence below keeps its D-49 words and its warn1 / muted colour.
  const balanceColor = negative ? colors.danger : colors.ink;
  const metaStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const foreign = account.currency !== homeCurrency;
  let homeFigure: string | null = null;
  let rateDate: string | null = null;
  let rateSource: 'frankfurter-v2' | 'open-er-api' | null = null;
  if (foreign && !overflow && balance.balance !== null) {
    const home = projectionHomeAmount(balance.balance, account.currency, homeCurrency, rates ?? []);
    if (home !== null) {
      homeFigure = fmtIn(homeCurrency)(home);
      const quote = account.currency === 'EUR' ? homeCurrency : account.currency;
      const fx = (rates ?? []).find((r) => r.quote === quote);
      rateDate = fx?.rate_date ?? null;
      rateSource = fx?.source ?? null;
    }
  }

  return (
    <View style={styles.block}>
      {compact ? null : <Text style={metaStyle}>{t('accounts.balanceNow')}</Text>}
      {overflow ? (
        <Text style={metaStyle} accessibilityLabel={t('accounts.balanceNow')}>—</Text>
      ) : (
        <Text style={{ ...textRole(pairing, compact ? 'body' : 'heading'), color: balanceColor }}>
          {fmt(balance.balance as number)}
        </Text>
      )}
      {line && !overflow ? (
        <Text
          style={{ ...textRole(pairing, 'label'), color: line.tone === 'warn' ? colors.warn1 : colors.inkMuted }}
          accessibilityLabel={sentenceOf(line)}
        >
          {sentenceOf(line)}
        </Text>
      ) : null}
      {homeFigure !== null ? (
        <>
          <Text style={metaStyle}>{t('accounts.inHome', { amount: homeFigure })}</Text>
          <RateAttribution rateDate={rateDate} rateSource={rateSource} ratePending={false} />
        </>
      ) : null}
      {compact
        ? null
        : balance.otherCurrencies.map((o) => (
            <Text key={o.currency} style={metaStyle}>
              {t('accounts.otherCurrency', { amount: fmtIn(o.currency)(o.paidSum), code: o.currency })}
            </Text>
          ))}
      {!compact && balance.pendingSum !== null && balance.pendingSum !== 0 ? (
        <Text
          style={{ ...textRole(pairing, 'label'), color: balance.pendingSum > 0 ? colors.accent : colors.danger }}
        >
          {t('accounts.stillToCome', { amount: fmt(balance.pendingSum) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.gapSm / 2,
  },
});
