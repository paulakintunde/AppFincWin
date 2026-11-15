// D-39: lists show the figure plus one short line; the detail screen shows the full block.
// An account's balance block (D-10, D-49): 'Balance now' in the account's own currency with
// the minus sign always visible, the standing sentence beneath it, other-currency subtotals,
// the still-to-come figure and, for a foreign account, an approximate home figure with the
// rate's date. The figure uses the latest stored rate only and never fetches (02-DECISION-fx-on-demand.md
// item 5); with no stored rate for the pair it reads "Waiting for a rate", never a guess.
// 06.2 D-14 (supersedes the 2026-10-07 amendment): a negative figure keeps its minus sign and speaks "minus"; it is
// ink, and danger only for money owed beyond a limit (overdrawn beyond the overdraft, card over its limit) or for
// debt (a card or loan with money owed). Ordinary spending is never red. The standing sentence stays the D-49 copy
// in warn1 / muted.
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { AccountRow } from '@/db/rows';
import type { Standing } from '@/engine/accounts';
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
import { compactBalanceLine, standingText, type StandingLine } from './standingText';

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

/**
 * 06.2 D-14: whether a balance figure is drawn in danger. Red means owed beyond a limit or debt: a deposit account
 * overdrawn beyond its overdraft, a card over its limit, or a card or loan with money owed. A deposit account that is
 * overdrawn within its overdraft (or with none set) stays ink: its minus sign and standing line carry it.
 */
export function balanceIsDanger(kind: AccountRow['kind'], balance: number | null, standing: Standing | null): boolean {
  if (balance === null) return false;
  if (standing?.kind === 'overdrawn-beyond' || standing?.kind === 'over-limit') return true;
  return (kind === 'credit' || kind === 'loan') && balance < 0;
}

/** 06.2 D-14: the spoken form of a figure; a negative one says "minus" in words, never only the sign. */
function spokenFigure(t: ReturnType<typeof useT>, balance: number, fmt: (minor: number) => string): string {
  return balance < 0 ? t('appLife.accounts.negativeA11y', { amount: fmt(Math.abs(balance)) }) : fmt(balance);
}

type FxRates = ReturnType<typeof useFxLatest>['data'];

/** The approximate home figure and its rate provenance; latest stored rate only, never a guess. */
function deriveHome(
  account: AccountRow,
  balance: AccountBalanceView,
  homeCurrency: string,
  rates: FxRates,
  fmtHome: (minor: number) => string
): { homeFigure: string | null; rateDate: string | null; rateSource: 'frankfurter-v2' | 'open-er-api' | null; foreign: boolean; overflow: boolean } {
  const overflow = balance.overflow || balance.balance === null;
  const foreign = account.currency !== homeCurrency;
  let homeFigure: string | null = null;
  let rateDate: string | null = null;
  let rateSource: 'frankfurter-v2' | 'open-er-api' | null = null;
  if (foreign && !overflow && balance.balance !== null) {
    const home = projectionHomeAmount(balance.balance, account.currency, homeCurrency, rates ?? []);
    if (home !== null) {
      homeFigure = fmtHome(home);
      const quote = account.currency === 'EUR' ? homeCurrency : account.currency;
      const fx = (rates ?? []).find((r) => r.quote === quote);
      rateDate = fx?.rate_date ?? null;
      rateSource = fx?.source ?? null;
    }
  }
  return { homeFigure, rateDate, rateSource, foreign, overflow };
}

export interface CompactBalance {
  figure: string | null;
  negative: boolean;
  /** 06.2 D-14: the figure is drawn in danger (owed beyond a limit, or debt). */
  danger: boolean;
  line: { text: string; tone: 'plain' | 'warn' } | null;
  label: string | null;
  /** 06.2 D-14: the label with a negative figure spoken as "minus ..." in words. */
  spokenLabel: string | null;
}

/** D-39: what a list row shows (figure + at most one short line) and speaks as its label. */
export function useCompactBalance(
  account: AccountRow,
  balance: AccountBalanceView | undefined,
  homeCurrency: string
): CompactBalance {
  const t = useT();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const rates = useFxLatest().data;
  if (!balance) return { figure: null, negative: false, danger: false, line: null, label: null, spokenLabel: null };
  const exponentFor = (code: string): number => options.find((o) => o.code === code)?.exponent ?? currencyExponent(code);
  const fmtIn = (code: string) => (minor: number) => formatter.formatMoney(money(minor, code), { exponent: exponentFor(code) });
  const { homeFigure, foreign, overflow } = deriveHome(account, balance, homeCurrency, rates, fmtIn(homeCurrency));
  const l = compactBalanceLine({ foreign, homeFigure, overflow, standing: balance.standing });
  const line = l ? { text: (t as unknown as (k: string, o: Record<string, string>) => string)(l.key, l.params), tone: l.tone } : null;
  const figure = overflow ? null : fmtIn(account.currency)(balance.balance as number);
  const negative = balance.balance !== null && balance.balance < 0;
  const label = [figure ?? t('accounts.balanceNow'), line?.text].filter((p): p is string => Boolean(p)).join(', ');
  const spoken = overflow ? null : spokenFigure(t, balance.balance as number, fmtIn(account.currency));
  const spokenLabel = [spoken ?? t('accounts.balanceNow'), line?.text].filter((p): p is string => Boolean(p)).join(', ');
  const danger = balanceIsDanger(account.kind, balance.balance, balance.standing);
  return { figure, negative, danger, line, label, spokenLabel };
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
  // 06.2 D-14: danger only for owed beyond a limit or debt; the minus sign is always visible and spoken.
  const balanceColor = balanceIsDanger(account.kind, balance.balance, balance.standing) ? colors.danger : colors.ink;
  const figureA11y = overflow ? undefined : spokenFigure(t, balance.balance as number, fmt);
  const metaStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const { homeFigure, rateDate, rateSource, foreign } = deriveHome(account, balance, homeCurrency, rates, fmtIn(homeCurrency));

  const waiting = foreign && !overflow && balance.balance !== null && homeFigure === null;

  if (compact) {
    const compactLine = compactBalanceLine({ foreign, homeFigure, overflow, standing: balance.standing });
    return (
      <View style={styles.block}>
        {overflow ? (
          <Text style={metaStyle} accessibilityLabel={t('accounts.balanceNow')}>—</Text>
        ) : (
          <Text style={{ ...textRole(pairing, 'body'), color: balanceColor }} accessibilityLabel={figureA11y}>
            {fmt(balance.balance as number)}
          </Text>
        )}
        {compactLine ? (
          <Text style={{ ...textRole(pairing, 'label'), color: compactLine.tone === 'warn' ? colors.warn1 : colors.inkMuted }}>
            {(t as unknown as (k: string, o: Record<string, string>) => string)(compactLine.key, compactLine.params)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {compact ? null : <Text style={metaStyle}>{t('accounts.balanceNow')}</Text>}
      {overflow ? (
        <Text style={metaStyle} accessibilityLabel={t('accounts.balanceNow')}>—</Text>
      ) : (
        <Text style={{ ...textRole(pairing, compact ? 'body' : 'heading'), color: balanceColor }} accessibilityLabel={figureA11y}>
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
      ) : waiting ? (
        <Text style={metaStyle}>{t('accounts.inHomeWaiting')}</Text>
      ) : null}
      {compact
        ? null
        : balance.otherCurrencies.map((o) => (
            <Text key={o.currency} style={metaStyle}>
              {t('accounts.otherCurrency', { amount: fmtIn(o.currency)(o.paidSum), code: o.currency })}
            </Text>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.gapSm / 2,
  },
});
