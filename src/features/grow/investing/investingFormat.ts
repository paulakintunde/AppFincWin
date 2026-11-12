// 06-18: shared money and date wording for the Investing screens. Dates are calendar days ('Nov 1'), pinned to UTC so the
// device zone never moves them; money is formatted in the holding's own currency (or the home currency for totals).
import { currencyCode, currencyExponent, minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface InvestingFormat {
  home: string;
  today: string;
  money: (minor: number, currency?: string) => string;
  /** '+$650' or '-$100' (a minus sign, never red). */
  signed: (minor: number, currency?: string) => string;
  /** 'Nov 1' */
  day: (date: string) => string;
}

export function useInvestingFormat(): InvestingFormat {
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(rc.showCents, rc.homeCurrency);
  const money = (minor: number, currency: string = rc.homeCurrency): string =>
    fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) }, { exponent: currencyExponent(currency) });
  const signed = (minor: number, currency: string = rc.homeCurrency): string =>
    `${minor < 0 ? '-' : '+'}${money(Math.abs(minor), currency)}`;
  const day = (date: string): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(fmt.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, d!));
  };
  return { home: rc.homeCurrency, today: rc.today, money, signed, day };
}

/** True for blank, or a percent text from 0 to 100 ('4.5'); the same rule the account and holding hooks apply. */
export function validRateText(text: string): boolean {
  const s = text.trim();
  if (s === '') return true;
  try {
    percent(s);
    return Number(s) <= 100;
  } catch {
    return false;
  }
}

export const DATE_TEXT_RE = /^\d{4}-\d{2}-\d{2}$/;

/** P3-WR-09: a real calendar day in YYYY-MM-DD ('2026-02-31' is not one). */
export function validDateText(text: string): boolean {
  if (!DATE_TEXT_RE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  if (m! < 1 || m! > 12 || d! < 1) return false;
  return d! <= new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Percent text from tenths of a percent: 112 -> '11.2'. */
export function tenthsText(tenths: number): string {
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  return frac === 0 ? String(whole) : `${whole}.${frac}`;
}
