// 05.3-31: shared fixtures for the Help screen tests.
import type { V3Inputs, V3Line } from '@/engine/decide/v3';

const line = (id: string, role: V3Line['role'], amount: number, status: V3Line['status'] = 'paid'): V3Line =>
  ({ id, date: '2026-10-05', amount, role, status, seriesId: null, categoryId: null, coversMonths: null, expected: false, incomeKind: null, countsAs: null }) as unknown as V3Line;

export const MONTH_LINES: V3Line[] = [
  line('a', 'income', 300000),
  line('b', 'spending', 80000),
  line('c', 'spending', 20000),
  line('d', 'debt_payment', 15000),
  line('e', 'spending', 99999, 'pending'),
];

export function roughInputs(over: Partial<{ lines: V3Line[]; rough: V3Inputs['rough']; full: boolean }> = {}): V3Inputs {
  return {
    asOf: '2026-10-20',
    currency: 'USD',
    months: [{ month: '2026-10', full: over.full ?? false, mark: null, lines: over.lines ?? MONTH_LINES }],
    rough: over.rough ?? null,
  } as unknown as V3Inputs;
}
