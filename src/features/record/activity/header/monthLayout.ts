// Month-row layout decision and Intl month labels for the Activity header (D-54 Intl names,
// D-55 shorten the name first then move icons, D-58 compact title month). Pure and React-free;
// kept out of engine/ on purpose (coverage gate).

function formatMonth(month: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

/** Short month with year, e.g. 'Oct 2026'. Names come from Intl, never a slice. */
export function formatMonthShort(month: string, locale: string): string {
  return formatMonth(month, locale, { month: 'short', year: 'numeric' });
}

/** Compact title month: short month, plus the year only when it is not the current year. */
export function compactMonthLabel(month: string, currentMonth: string, locale: string): string {
  const sameYear = month.slice(0, 4) === currentMonth.slice(0, 4);
  return formatMonth(month, locale, sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' });
}

export interface MonthLayoutInput {
  rowWidth: number;
  longWidth: number;
  shortWidth: number;
  arrowsWidth: number;
  iconsWidth: number;
  gap: number;
}

export interface MonthLayout {
  name: 'long' | 'short';
  icons: 'inline' | 'below';
}

export function chooseMonthLayout(i: MonthLayoutInput): MonthLayout {
  if (i.rowWidth <= 0 || i.longWidth <= 0) return { name: 'long', icons: 'inline' };
  const inlineRoom = i.rowWidth - i.arrowsWidth - i.iconsWidth - i.gap;
  if (i.longWidth <= inlineRoom) return { name: 'long', icons: 'inline' };
  if (i.shortWidth > 0 && i.shortWidth <= inlineRoom) return { name: 'short', icons: 'inline' };
  return { name: i.longWidth <= i.rowWidth - i.arrowsWidth ? 'long' : 'short', icons: 'below' };
}
