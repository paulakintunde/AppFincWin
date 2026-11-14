const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM' to the last day of that month as 'YYYY-MM-DD' (string maths only, no time zone). */
export function lastDayOfMonth(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map((p) => parseInt(p, 10));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(day)}`;
}
