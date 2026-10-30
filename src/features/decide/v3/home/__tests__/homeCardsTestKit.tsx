// 05.3-23: shared test doubles for the home cards (formatter, Sam's evaluation slice).
import { minorUnits } from '@/engine/money';
import type { Evaluation } from '@/engine/decide/v3';
import { monthOf, SAM_PARTS } from '../../model/__tests__/monthFixture';

const dollars = (minor: number): string => {
  const abs = Math.abs(Math.round(minor / 100)).toLocaleString('en-US');
  return `${minor < 0 ? '-' : ''}$${abs}`;
};

/** A stand-in for useV3Format: same shapes, no data hooks. */
export const fakeFormat = {
  money: dollars,
  moneyA11y: dollars,
  month: (ym: string) => (ym === '2026-10' ? 'October' : ym),
  monthYear: (ym: string) => ym,
  date: (iso: string) => iso,
  params: () => ({ screen: {}, a11y: {} }),
  flat: () => ({ screen: {}, a11y: {} }),
};

/** 05.3-60: the date Sam last confirmed unspent money (the anchor date the Unspent row's detail line shows). */
export const SAM_UNSPENT_AT = '2026-10-02';
const SAM_MONTHS_USED = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

/** An unspent state with Sam's anchor, so tests can vary only the flags. */
export function samUnspent(over: { value?: number; stale?: boolean; drifted?: boolean } = {}): unknown {
  const value = minorUnits(over.value ?? 120000);
  return { value, anchor: { amount: value, at: SAM_UNSPENT_AT }, stale: over.stale ?? false, drifted: over.drifted ?? false };
}

export function samEvaluation(
  over: { monthLeft?: number; unspent?: unknown; emergency?: number | null; typicalLeft?: number | null; monthsUsed?: readonly string[]; fundUnlinked?: boolean } = {},
): Pick<Evaluation, 'month' | 'funds'> {
  const base = monthOf(SAM_PARTS);
  const month = {
    ...base,
    month: '2026-10',
    day: 18,
    daysInMonth: 31,
    monthsUsed: over.monthsUsed ?? SAM_MONTHS_USED,
    typicalLeft: over.typicalLeft === undefined ? minorUnits(36000) : over.typicalLeft === null ? null : minorUnits(over.typicalLeft),
    ...(over.monthLeft === undefined ? {} : { monthLeft: minorUnits(over.monthLeft) }),
  };
  const funds = {
    unspent: over.unspent === undefined ? samUnspent() : over.unspent,
    emergency: over.emergency === undefined ? minorUnits(500000) : over.emergency === null ? null : minorUnits(over.emergency),
    ...(over.fundUnlinked === undefined ? {} : { fundUnlinked: over.fundUnlinked }),
  };
  return { month, funds } as unknown as Pick<Evaluation, 'month' | 'funds'>;
}
