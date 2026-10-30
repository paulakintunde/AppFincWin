// 05.3-30: shared fixtures for the Worked screen tests (Sam's October, six past months, two confirmed bills).
import { minorUnits } from '@/engine/money';
import type { V3Inputs } from '@/engine/decide/v3';
import { monthOf, SAM_PARTS } from '../../model/__tests__/monthFixture';
import { fakeFormat as base } from '../../home/__tests__/homeCardsTestKit';

const NAMES: Record<string, string> = { '2026-04': 'April', '2026-05': 'May', '2026-06': 'June', '2026-07': 'July', '2026-08': 'August', '2026-09': 'September', '2026-10': 'October' };
export const fakeFormat = { ...base, month: (ym: string) => NAMES[ym] ?? ym, date: (iso: string) => `d:${iso}` };

const mu = minorUnits;
const bill = (id: string, confirmed: boolean, day: number) => ({
  id,
  role: 'bill',
  confirmed,
  status: 'live',
  anchorDate: `2026-09-${String(day).padStart(2, '0')}`,
  amount: mu(1000),
});
const pastMonth = (month: string, income: number, spent: number, mark: string | null = null) => ({
  month,
  full: true,
  mark,
  lines: [
    { role: 'income', amount: mu(income), status: 'paid' },
    { role: 'spending', amount: mu(spent), status: 'paid' },
  ],
});

export function samEvaluation(over: { monthLeft?: number; monthsUsed?: string[]; typicalLeft?: number | null } = {}) {
  const month = {
    ...monthOf(SAM_PARTS),
    month: '2026-10',
    day: 18,
    daysInMonth: 31,
    monthsUsed: over.monthsUsed ?? ['2026-04', '2026-05', '2026-06', '2026-07', '2026-09'],
    notices: [],
    typicalLeft: over.typicalLeft === undefined ? mu(36000) : over.typicalLeft === null ? null : mu(over.typicalLeft),
    ...(over.monthLeft === undefined ? {} : { monthLeft: mu(over.monthLeft) }),
  };
  return { month } as never;
}

export function samInputs(over: { series?: unknown[]; months?: unknown[]; unspent?: unknown } = {}): V3Inputs {
  return {
    debts: [{ id: 'd1', minimum: mu(3000) }],
    series:
      over.series ??
      [{ id: 'p', role: 'pay', confirmed: true, status: 'live', anchorDate: '2026-10-01' }, bill('rent', true, 1), bill('phone', true, 12), bill('gym', false, 20)],
    months: over.months ?? [
      pastMonth('2026-04', 400000, 350000),
      pastMonth('2026-05', 400000, 360000),
      pastMonth('2026-06', 400000, 370000),
      pastMonth('2026-07', 400000, 355000),
      pastMonth('2026-08', 400000, 395000, 'half'),
      pastMonth('2026-09', 400000, 330000),
    ],
    unspent: over.unspent === undefined ? { amount: mu(120000), at: '2026-10-02' } : over.unspent,
  } as unknown as V3Inputs;
}

export const NAME_MAP = { rent: 'Rent', phone: 'Phone', gym: 'Gym' };
