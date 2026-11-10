// 06-17: the reads and formatters the Debts screens share. The debt rows come from the same cached read as useDebtsRead; the month
// picture (usual pay, what is left each month) comes from Decide's own month breakdown, and the rule from Decide's settings.
// Nothing is worked out here beyond formatting.
import { useCallback, useMemo } from 'react';
import type { Href } from 'expo-router';
import { useDebts, useDecideSettings, useDecideSnapshot } from '@/data/queries/decide';
import type { DebtRow } from '@/db/debts';
import { currencyCode, minorUnits } from '@/engine/money';
import { monthBreakdown } from '@/features/decide/home/homeCardModel';
import { useRecordContext } from '@/features/record/useRecordContext';
import { formatOrdinal } from '@/i18n/ordinal';
import { useT } from '@/i18n';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface DebtMonth {
  /** Usual pay in minor units of `currency`; null until there is a month to read. */
  usualPay: number | null;
  /** What is left each month, signed; null when unknown. */
  left: number | null;
  /** The user's debt-payment rule as typed, "36"; null when none is set. */
  rule: string | null;
  currency: string;
}

export function useDebtMonth(): DebtMonth {
  const rc = useRecordContext();
  const snapshot = useDecideSnapshot();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const result = snapshot.result;
  const breakdown = useMemo(() => (result === null ? null : monthBreakdown(result, rc.today)), [result, rc.today]);
  const stored = settings?.dsr_line ?? null;
  const rule = stored === null || Number.isNaN(Number(stored)) ? null : String(Number(stored));
  return {
    usualPay: breakdown === null ? null : breakdown.income,
    left: breakdown === null ? null : breakdown.result,
    rule,
    currency: result?.currency ?? rc.homeCurrency,
  };
}

/** The open debts as stored, by id (the read model keeps the engine figures, not the typed rate text). */
export function useDebtRows(householdId: string | null): ReadonlyMap<string, DebtRow> {
  const rows = useDebts(householdId ?? undefined).data;
  return useMemo(() => new Map((rows ?? []).filter((r) => r.deleted_at === null).map((r) => [r.id, r] as const)), [rows]);
}

export interface DebtFormat {
  /** Whole amount: $8,420. */
  money(minor: number, currency: string): string;
  /** To the cent: $118.65. */
  cents(minor: number, currency: string): string;
  /** Spoken amount for a screen reader. */
  spoken(minor: number, currency: string): string;
  /** "Apr 2029" from YYYY-MM-DD. */
  monthYear(date: string): string;
  /** "September 2037" from YYYY-MM-DD (spoken dates). */
  monthYearLong(date: string): string;
  /** "Nov 15" from YYYY-MM-DD. */
  dayMonth(date: string): string;
  /** "15th". */
  ordinal(day: number): string;
  /** "6.9%". */
  rate(apr: string | null): string | null;
}

export function useDebtFormat(): DebtFormat {
  const t = useT();
  const whole = useMoneyFormatter(false);
  const cents = useMoneyFormatter(true);
  const locale = whole.locale;
  const money = useCallback((minor: number, currency: string) => whole.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) }), [whole]);
  const centsFn = useCallback((minor: number, currency: string) => cents.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) }), [cents]);
  const spoken = useCallback((minor: number, currency: string) => whole.formatMoneyA11y({ amount: minorUnits(minor), currency: currencyCode(currency) }), [whole]);
  const monthYear = useCallback(
    (date: string) => {
      const [y, m] = date.split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, 1));
    },
    [locale]
  );
  const monthYearLong = useCallback(
    (date: string) => {
      const [y, m] = date.split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, 1));
    },
    [locale]
  );
  const dayMonth = useCallback(
    (date: string) => {
      const [y, m, d] = date.split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, d!));
    },
    [locale]
  );
  const ordinal = useCallback((day: number) => formatOrdinal(day, locale, t as (key: string, options?: Record<string, unknown>) => string), [locale, t]);
  const rate = useCallback(
    (apr: string | null) => {
      if (apr === null || apr === '' || Number.isNaN(Number(apr))) return null;
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(apr))}%`;
    },
    [locale]
  );
  return useMemo(
    () => ({ money, cents: centsFn, spoken, monthYear, monthYearLong, dayMonth, ordinal, rate }),
    [money, centsFn, spoken, monthYear, monthYearLong, dayMonth, ordinal, rate]
  );
}

/** The debt detail route (06-17). */
export const debtHref = (id: string): Href => `/grow/debt/${id}` as Href;

/** The account the extra payment leaves: the debt's own, else the first open checking account, else the first open one. */
export function payAccountId(debt: DebtRow, accounts: readonly { id: string; kind: string; archived_at: string | null }[]): string | null {
  if (debt.account_id !== null) return debt.account_id;
  const open = accounts.filter((a) => a.archived_at === null);
  return (open.find((a) => a.kind === 'checking') ?? open[0])?.id ?? null;
}
