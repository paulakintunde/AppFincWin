import { assumptions } from '../assumptions';

const ev = (reasons: string[], month = '2026-10', daysInMonth = 31) =>
  ({ month: { month, daysInMonth, erest: 12345 }, result: { confidence: { level: 'fair', reasons } } }) as never;

describe('assumptions', () => {
  it('names the everyday-rest figure and the last day of the month', () => {
    expect(assumptions(ev([]))).toEqual({ key: 'decide.v3.ui.answer.assumptions', params: { amount: 12345, date: '2026-10-31' } });
    expect(assumptions(ev([], '2026-02', 28)).params.date).toBe('2026-02-28');
  });
  it('rough figures read the typed variant', () => {
    expect(assumptions(ev(['few_months', 'rough_figures'])).key).toBe('decide.v3.ui.answer.assumptionsTyped');
  });
});
