// 06.1-15: small local-day helpers for the input sheets. Pure, UTC arithmetic on 'YYYY-MM-DD' strings (no device zone enters).

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function parseDay(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function toDay(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parseDay(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysTo(date: string, n: number): string {
  const { y, m, d } = parseDay(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Same day-of-month `months` later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsTo(date: string, months: number): string {
  const { y, m, d } = parseDay(date);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return toDay(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function daysBetweenDays(a: string, b: string): number {
  const pa = parseDay(a);
  const pb = parseDay(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}
