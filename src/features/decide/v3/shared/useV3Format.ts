// 05.3: the one place v3 screens turn model params into strings. Money via the shipped formatter (integer minor units in, never floats).
import { useCallback, useMemo } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { usePots } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { COPY_RESOLVERS, DISCRIMINATOR_KEYS } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { heroAmountText } from './heroAmountText';
import type { ViewParams } from './params';

type Strings = Record<string, string>;
export interface V3Strings {
  screen: Strings;
  a11y: Strings;
}

export interface V3Format {
  money(minor: number): string;
  moneyA11y(minor: number): string;
  month(ym: string): string;
  monthYear(ym: string): string;
  date(iso: string): string;
  params(p: ViewParams): V3Strings;
  flat(p: Readonly<Record<string, string | number>>, moneyKeys: readonly string[]): V3Strings;
}

const RESOLVER_IDS = Object.keys(COPY_RESOLVERS) as (keyof typeof COPY_RESOLVERS)[];
const DISCRIMINATORS: readonly string[] = DISCRIMINATOR_KEYS;

function ymDate(ym: string): Date {
  const [y, m] = ym.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1));
}

export function useV3Format(): V3Format {
  const t = useT();
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(rc.showCents, rc.homeCurrency);
  const { formatMoney, formatMoneyA11y, formatDate, locale } = fmt;
  const currency = rc.homeCurrency;

  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const series = useRecurringSeries(rc.householdId ?? undefined).data;
  const pots = usePots(rc.userId ?? undefined, rc.householdId ?? undefined).data;

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories.all) m.set(c.id, categoryName(c, t));
    for (const a of accounts ?? []) m.set(a.id, a.name);
    for (const s of series ?? []) m.set(s.id, s.name);
    for (const p of [...(pots?.live ?? []), ...(pots?.done ?? [])]) m.set(p.id, p.name);
    return m;
  }, [categories.all, accounts, series, pots, t]);

  const money = useCallback(
    (minor: number) => heroAmountText(formatMoney({ amount: minorUnits(minor), currency } as never)).text,
    [formatMoney, currency],
  );
  const moneyA11y = useCallback(
    (minor: number) => formatMoneyA11y({ amount: minorUnits(minor), currency } as never),
    [formatMoneyA11y, currency],
  );
  const month = useCallback(
    (ym: string) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(ymDate(ym)),
    [locale],
  );
  const monthYear = useCallback(
    (ym: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ymDate(ym)),
    [locale],
  );
  const date = useCallback((iso: string) => formatDate(iso), [formatDate]);

  return useMemo<V3Format>(() => {
    const params = (p: ViewParams): V3Strings => {
      const screen: Strings = {};
      const a11y: Strings = {};
      for (const [key, v] of Object.entries(p)) {
        switch (v.kind) {
          case 'money':
            screen[key] = money(v.minor);
            a11y[key] = moneyA11y(v.minor);
            break;
          case 'month':
            screen[key] = month(v.ym);
            a11y[key] = screen[key];
            break;
          case 'date':
            screen[key] = date(v.iso);
            a11y[key] = screen[key];
            break;
          case 'count':
            screen[key] = String(v.n);
            a11y[key] = screen[key];
            break;
        }
      }
      return { screen, a11y };
    };
    const flat = (p: Readonly<Record<string, string | number>>, moneyKeys: readonly string[]): V3Strings => {
      const screen: Strings = {};
      const a11y: Strings = {};
      for (const [key, v] of Object.entries(p)) {
        if (DISCRIMINATORS.includes(key)) continue;
        if ((RESOLVER_IDS as string[]).includes(key)) {
          const name = names.get(String(v)) ?? '';
          const target = COPY_RESOLVERS[key as keyof typeof COPY_RESOLVERS];
          screen[target] = name;
          a11y[target] = name;
        } else if (moneyKeys.includes(key) && typeof v === 'number') {
          screen[key] = money(v);
          a11y[key] = moneyA11y(v);
        } else {
          screen[key] = String(v);
          a11y[key] = String(v);
        }
      }
      return { screen, a11y };
    };
    return { money, moneyA11y, month, monthYear, date, params, flat };
  }, [money, moneyA11y, month, monthYear, date, names]);
}
