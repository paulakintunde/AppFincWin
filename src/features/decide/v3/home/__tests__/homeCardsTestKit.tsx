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

export function samEvaluation(over: { monthLeft?: number; unspent?: unknown; emergency?: number | null; typicalLeft?: number | null } = {}): Pick<Evaluation, 'month' | 'funds'> {
  const base = monthOf(SAM_PARTS);
  const month = {
    ...base,
    month: '2026-10',
    day: 18,
    daysInMonth: 31,
    typicalLeft: over.typicalLeft === undefined ? minorUnits(36000) : over.typicalLeft === null ? null : minorUnits(over.typicalLeft),
    ...(over.monthLeft === undefined ? {} : { monthLeft: minorUnits(over.monthLeft) }),
  };
  const funds = {
    unspent:
      over.unspent === undefined
        ? { value: minorUnits(120000), stale: false, drifted: false }
        : over.unspent,
    emergency: over.emergency === undefined ? minorUnits(500000) : over.emergency === null ? null : minorUnits(over.emergency),
  };
  return { month, funds } as unknown as Pick<Evaluation, 'month' | 'funds'>;
}
