// 05-08 (DCU-08, D-13): calendar offsets for the "buy later" date, and the past-date test.
// String arithmetic on 'YYYY-MM-DD' only, no Date#toISOString (MON-14). Month offsets clamp
// to month end via the recurring schedule maths (31 Jan + 1 month = 28/29 Feb).
import { occurrenceDate, type RecurringFreq } from '@/engine/recurring/schedule';

export const OFFSETS = [
  { key: 'inWeek', freq: 'weekly', n: 1 },
  { key: 'inMonth', freq: 'monthly', n: 1 },
  { key: 'in3Months', freq: 'monthly', n: 3 },
] as const satisfies readonly { key: string; freq: RecurringFreq; n: number }[];

export type OffsetKey = (typeof OFFSETS)[number]['key'];

export type AwayText =
  | { key: 'today' }
  | { key: 'tomorrow' }
  | { key: 'days'; count: number }
  | { key: 'months'; count: number };

export function offsetDate(today: string, key: OffsetKey): string {
  const offset = OFFSETS.find((o) => o.key === key) as (typeof OFFSETS)[number];
  return occurrenceDate(today, offset.freq, offset.n);
}

export function isPastDate(date: string, today: string): boolean {
  return date < today;
}

function parts(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  return [y, m, d];
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function awayFrom(today: string, date: string): AwayText {
  const days = dayDiff(today, date);
  if (days <= 0) return { key: 'today' };
  if (days === 1) return { key: 'tomorrow' };
  if (days <= 30) return { key: 'days', count: days };
  const [ty, tm] = parts(today);
  const [dy, dm] = parts(date);
  let months = (dy - ty) * 12 + (dm - tm);
  // Whole calendar months: step back one when the day of month has not been reached yet.
  if (occurrenceDate(today, 'monthly', months) > date) months -= 1;
  return { key: 'months', count: Math.max(1, months) };
}
