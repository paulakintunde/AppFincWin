import type { V3Inputs, V3Line } from '@/engine/decide/v3';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import { buildV3Inputs } from '../buildV3Inputs';
import { stripRefunds } from '../stripRefunds';

const base = (): V3Inputs => buildV3Inputs(demoSource('2026-10-03'), null);
const line = (over: Partial<V3Line>): V3Line =>
  ({ id: 'x', date: '2026-09-02', amount: 100, role: 'refund', status: 'paid', seriesId: null, categoryId: null, coversMonths: null, expected: false, incomeKind: null, countsAs: 'available', ...over }) as V3Line;

describe('stripRefunds (D-13)', () => {
  it('leaves inputs without refund links deep-equal', () => {
    const inputs = base();
    expect(stripRefunds(inputs)).toEqual(inputs);
  });

  it('clears every refund link, keeps the refund lines themselves, and never mutates its input', () => {
    const inputs = base();
    const [first, ...rest] = inputs.months;
    const linkedMonth = { ...first!, lines: [...first!.lines, line({ id: 'r1', refundOf: 'buy' }), line({ id: 'r2', refundOf: null })] };
    const frozen: V3Inputs = Object.freeze({ ...inputs, months: Object.freeze([linkedMonth, ...rest]) });
    const out = stripRefunds(frozen);
    const lines = out.months.flatMap((m) => m.lines);
    expect(lines.every((l) => l.refundOf === undefined || l.refundOf === null)).toBe(true);
    expect(lines.find((l) => l.id === 'r1')).toBeDefined();
    expect(frozen.months[0]!.lines.find((l) => l.id === 'r1')!.refundOf).toBe('buy');
    expect(out.months.slice(1)).toEqual(rest);
  });
});
