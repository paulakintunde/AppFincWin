/**
 * 08.1-24 (owner later dips option 1, 2026-11-20; caution sign 2026-11-21): the later-dip fact a Fits answer carries when its
 * 12-month path goes below $0 after the first 90 days (engine 08.1-13: below_zero_later_without / below_zero_later_with). Pure:
 * no React, no I/O. The screen shows a caution sign from it; the verdict itself never changes.
 * T-08.1-69: only a fits_* answer can carry the sign, and only with a well-formed YYYY-MM-DD date.
 */
import type { Result } from '@/engine/decide/v3';

export interface LaterDip {
  /** 'without': the account goes below $0 even without the purchase; 'with': only because of it. */
  readonly kind: 'without' | 'with';
  /** The first day below $0, YYYY-MM-DD. */
  readonly date: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function laterDipOf(r: Pick<Result, 'code' | 'facts'> | null): LaterDip | null {
  if (r === null || !r.code.startsWith('fits_')) return null;
  const fact = r.facts.find((f) => f.code === 'below_zero_later_without' || f.code === 'below_zero_later_with');
  if (fact === undefined) return null;
  const date = (fact.values as Readonly<Record<string, unknown>>).date;
  if (typeof date !== 'string' || !DATE.test(date)) return null;
  return { kind: fact.code === 'below_zero_later_without' ? 'without' : 'with', date };
}
