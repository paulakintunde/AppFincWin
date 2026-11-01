import type { Evaluation, MissingCode } from '@/engine/decide/v3';
import { askModel } from '../ask';

type Ev = Pick<Evaluation, 'result' | 'month' | 'uncoveredIncome'>;
const ev = (uncoveredIncome?: readonly string[]): Ev =>
  ({ result: { missing: ['expected_income_needed'] as MissingCode[], notices: [] }, month: { month: '2026-10' }, uncoveredIncome }) as unknown as Ev;

describe('05.3-106 expected income question names the first uncovered month', () => {
  it('names the first listed month and counts the list, across a month boundary', () => {
    const list = ['2026-11', '2026-12', '2027-01'];
    const m = askModel(ev(list))!;
    expect(m.first.params).toEqual({ month: '2026-11', months: 3 });
    expect(m.first.months).toEqual(list);
  });

  it('falls back to this month when the engine lists none', () => {
    expect(askModel(ev([]))!.first.params).toEqual({ month: '2026-10', months: 1 });
    expect(askModel(ev())!.first.months).toEqual(['2026-10']);
  });
});
