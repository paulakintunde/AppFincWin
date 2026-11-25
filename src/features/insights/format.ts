// 07-08: display helpers for Insights. Basis points to whole percent with integer maths; no money is computed here.
export function percentText(bp: number): string {
  return String(Math.floor((bp + 50) / 100));
}

export function tenthsText(tenths: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(tenths / 10);
}

export function monthShort(ym: string, locale: string, withYear: boolean): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const name = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return withYear ? `${name} ’${String(y % 100).padStart(2, '0')}` : name;
}
