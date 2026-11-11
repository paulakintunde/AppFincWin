// 06.1-14 (D-18): binds the pure sayResult to the app's i18n, money and date formatting. The engine Result becomes sentences here and
// nowhere else; a line with no copy is dropped and reported through onMissing, never printed as a code.
import { useMemo } from 'react';
import { i18n, useT } from '@/i18n';
import type { Result } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { MissingCopyError, sayResult, type SayDeps, type SayNames, type SaidResult } from '../logic/sayResult';
import { verdictValues } from './verdictValues';

export interface UseSaidOptions {
  readonly currency: string;
  /** The check date (a purchase dated today reads "Bought today."). */
  readonly today: string;
  readonly showCents?: boolean;
  /** Name lookups from the category / series / account / debt / envelope reads. A missing one reads as the plain word. */
  readonly names?: Partial<SayNames>;
  readonly onMissing?: (error: MissingCopyError) => void;
}

const FALLBACK_NAME = (): string => '';

export type Said = SaidResult & { readonly verdictValues: Readonly<Record<string, string>> };

export const EMPTY_SAID: Said = Object.freeze({
  verdictValues: {},
  notices: [],
  facts: [],
  basis: null,
  caveat: null,
  caveatFigures: [],
  nextStep: null,
  missing: [],
  readiness: [],
  afterBuy: { lead: null, boughtOn: null },
});

/** A 'YYYY-MM' month as "November 2026" in the device locale; a full date goes to the formatter. */
function monthText(locale: string, ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function useSaid(result: Result | null, opts: UseSaidOptions): Said {
  const t = useT();
  const fmt = useMoneyFormatter(opts.showCents ?? true);
  const { currency, today, names, onMissing } = opts;
  const { formatMoney, formatDate, locale } = fmt;

  return useMemo(() => {
    if (result === null) return EMPTY_SAID;
    const deps: SayDeps = {
      t: (key, values) => String(values === undefined ? t(key as never) : t(key as never, values as never)),
      exists: (key) => i18n.exists(key),
      money: (minor, code) => formatMoney(makeMoney(minor, code)),
      date: (d) => (d.length === 7 ? monthText(locale, d) : formatDate(d)),
      currency,
      today,
      names: {
        category: names?.category ?? FALLBACK_NAME,
        series: names?.series ?? FALLBACK_NAME,
        account: names?.account ?? FALLBACK_NAME,
        debt: names?.debt ?? FALLBACK_NAME,
        envelope: names?.envelope ?? FALLBACK_NAME,
        figure: names?.figure ?? FALLBACK_NAME,
      },
      onMissing: onMissing ?? ((): void => undefined),
    };
    return { ...sayResult(result, deps), verdictValues: verdictValues(result, deps) };
  }, [result, t, formatMoney, formatDate, locale, currency, today, names, onMissing]);
}
