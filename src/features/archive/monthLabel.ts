// 10-24: 'YYYY-MM' to 'August 2026' in the given locale (UTC, so the day never shifts the month).
export function monthLabel(month: string, locale: string): string {
  const [year, mon] = month.split('-') as [string, string];
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Number(year), Number(mon) - 1, 1));
}

/** The route param guard (T-10-24-04): 'YYYY-MM' with a real month, nothing else. */
export const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;
