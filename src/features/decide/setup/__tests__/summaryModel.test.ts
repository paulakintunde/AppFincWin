import { summaryModel, incomeWordKeys, type SummaryEvaluation } from '../summaryModel';

const m = (n: number) => n as never;

/** The owner's Sam yardstick: $4,000 in, $3,575 out so far, about $425 left, unspent $2,400, emergency $9,000, envelopes $2,500. */
const sam = (over: Partial<SummaryEvaluation['funds']> = {}): SummaryEvaluation => ({
  month: { month: m('2026-10' as never), moneyIn: m(400000), moneyOut: m(357500), monthLeft: m(42500), e: m(478016) } as SummaryEvaluation['month'],
  funds: {
    unspent: { value: m(240000), anchor: { amount: m(240000), at: '2026-10-15' as never }, rolled: false, stale: false, drifted: false, breakdown: {} as never },
    suggested: m(238000),
    emergency: m(900000),
    envelopesSaved: m(250000),
    ...over,
  } as SummaryEvaluation['funds'],
});

describe('summaryModel', () => {
  it('gives the Sam rows straight off the evaluation', () => {
    const rows = summaryModel(sam(), { income_types: ['salary_or_wages'], variable_method: 'steady' }, null, '2026-10-15');
    expect(rows).toEqual([
      { key: 'month', month: '2026-10', moneyIn: 400000, moneyOut: 357500 },
      { key: 'leave', amount: 42500 },
      { key: 'typical', amount: 478016 },
      { key: 'unspent', amount: 240000, checked: 'today' },
      { key: 'emergency', amount: 900000 },
      { key: 'envelopes', amount: 250000 },
      { key: 'income', wordKeys: ['income.paid.optionSalary', 'decide.setup.summary.methodSteady'] },
    ]);
  });

  it('uses the available figure after held-back money, and the anchor date when it is not today', () => {
    const rows = summaryModel(
      sam({ unspent: { value: m(240000), available: m(200000), anchor: { amount: m(240000), at: '2026-09-20' as never }, rolled: true, stale: false, drifted: false, breakdown: {} as never } }),
      null,
      null,
      '2026-10-15'
    );
    expect(rows.find((r) => r.key === 'unspent')).toEqual({ key: 'unspent', amount: 200000, checked: '2026-09-20' });
  });

  it('shows the suggested sum alone when nothing is confirmed, Not set for no emergency fund, and drops a missing typical month and income words', () => {
    const base = sam({ unspent: null, emergency: null });
    const ev: SummaryEvaluation = { ...base, month: { ...base.month, e: null } };
    const rows = summaryModel(ev, null, null, '2026-10-15');
    expect(rows.find((r) => r.key === 'unspent')).toEqual({ key: 'unspent', amount: 238000, checked: null });
    expect(rows.find((r) => r.key === 'emergency')).toEqual({ key: 'emergency', amount: null });
    expect(rows.some((r) => r.key === 'typical')).toBe(false);
    expect(rows.some((r) => r.key === 'income')).toBe(false);
  });

  it('the typical row is the own everyday figure when set, else the engine typical everyday (F-04)', () => {
    const typical = (override: number | null) => summaryModel(sam(), null, override, '2026-10-15').find((r) => r.key === 'typical');
    expect(typical(500000)).toEqual({ key: 'typical', amount: 500000 });
    expect(typical(null)).toEqual({ key: 'typical', amount: 478016 });
  });

  it('the month row still carries money in and out straight from the evaluation', () => {
    expect(summaryModel(sam(), null, null, '2026-10-15')[0]).toEqual({ key: 'month', month: '2026-10', moneyIn: 400000, moneyOut: 357500 });
  });

  it('income words follow the six setup values then the counting method', () => {
    expect(incomeWordKeys({ income_types: ['freelance', 'pension_or_benefits'], variable_method: 'balance' })).toEqual([
      'income.paid.optionFreelance',
      'income.paid.optionPension',
      'decide.setup.summary.methodBalance',
    ]);
    expect(incomeWordKeys({ income_types: null, variable_method: null })).toEqual([]);
  });
});
