import * as fc from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import type { MonthMark, V3Month, V3Series } from '../../types';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { everydayByMonth, medianHalfUp, typicalOf, type TypicalInput } from '../typical';

const NUM_RUNS = 150;
const ASOF = '2026-10-03';
const MONTH = { unit: 'month', every: 1 } as const;

function everydayMonth(month: string, amount: number, mark: MonthMark = null, extra: ReturnType<typeof v3Line>[] = []): V3Month {
  return monthOf(month, [v3Line({ id: `e-${month}`, date: `${month}-10`, amount }), ...extra], { mark });
}

function input(over: Partial<TypicalInput> = {}): TypicalInput {
  return {
    asOf: ASOF,
    history: [],
    series: [],
    typicalIncome: mu(400000),
    setAside: mu(30000),
    everydayOverride: null,
    rough: null,
    ...over,
  };
}

const seriesBill = (over: Omit<Partial<V3Series>, 'amount'> & { id: string; amount: number }): V3Series =>
  v3Series({ role: 'bill', cadence: MONTH, anchorDate: '2026-01-05', ...over });

const MONTHS6 = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

describe('medianHalfUp', () => {
  it('D-29 even count: half-up mean of the two middle values', () => {
    expect(medianHalfUp([1n, 2n])).toBe(2n);
    expect(medianHalfUp([1n, 2n, 3n, 4n])).toBe(3n);
    expect(medianHalfUp([3n, 1n, 2n])).toBe(2n);
    expect(medianHalfUp([-2n, -1n])).toBe(-2n);
    expect(medianHalfUp([7n])).toBe(7n);
  });
  it('throws on an empty list', () => {
    expect(() => medianHalfUp([])).toThrow(RangeError);
  });
});

describe('everydayByMonth', () => {
  it('counts everyday lines, subtracts refunds, floors at 0, ignores pending and bills', () => {
    const series = [seriesBill({ id: 'rent', amount: 150000 })];
    const m = monthOf('2026-08', [
      v3Line({ id: 'a', date: '2026-08-02', amount: 5000, categoryId: 'food' }),
      v3Line({ id: 'b', date: '2026-08-03', amount: 2000, role: 'refund', categoryId: 'food' }),
      v3Line({ id: 'c', date: '2026-08-04', amount: 1000, role: 'refund', categoryId: 'fun' }),
      v3Line({ id: 'd', date: '2026-08-05', amount: 9999, status: 'pending' }),
      v3Line({ id: 'r', date: '2026-08-01', amount: 150000, seriesId: 'rent' }),
    ]);
    const [out] = everydayByMonth([m], series);
    expect(out?.everyday).toBe(2000);
    expect(out?.byCategory.get('food')).toBe(3000n);
    expect(out?.byCategory.get('fun')).toBe(0n);
    const [floored] = everydayByMonth([monthOf('2026-08', [v3Line({ id: 'x', date: '2026-08-02', amount: 100, role: 'refund' })])], []);
    expect(floored?.everyday).toBe(0);
  });
  it('D-25 never regular: a dismissed series past lines are everyday spending', () => {
    const dismissed = seriesBill({ id: 'gym', amount: 4000, status: 'dismissed' });
    const m = monthOf('2026-08', [v3Line({ id: 'g', date: '2026-08-02', amount: 4000, seriesId: 'gym' })]);
    expect(everydayByMonth([m], [dismissed])[0]?.everyday).toBe(4000);
    const r = typicalOf(input({ history: [m], series: [dismissed] }));
    expect(r.e).toBe(4000);
  });
});

describe('typicalOf', () => {
  const sam = toV3Inputs(personById('sam'));
  const samInput = (): TypicalInput =>
    input({
      history: sam.months,
      series: sam.series,
      typicalIncome: mu(400000),
      setAside: mu(30000),
    });

  it('D-29 Sam median: E 1,475, typical month 425, low 50 in September', () => {
    const r = typicalOf(samInput());
    expect(r.e).toBe(147500);
    expect(r.recurringBills).toBe(180000);
    expect(r.typicalLeft).toBe(42500);
    expect(r.low).toEqual({ left: 5000, month: '2026-09', reason: 'second_lowest' });
    expect(r.monthsUsed).toEqual(MONTHS6);
    expect(r.housingMonthly).toBe(150000);
    expect(r.notices).toEqual([]);
    expect(r.reasons).toEqual([]);
  });

  it('v3 12 #9 median ignores the vet bill: E is below the plain mean', () => {
    const r = typicalOf(samInput());
    expect(r.e).toBeLessThan(180000);
  });

  it('low month with 2 months is the lowest, with 1 the only month', () => {
    const two = typicalOf(input({ history: [everydayMonth('2026-08', 100000), everydayMonth('2026-09', 150000)] }));
    expect(two.low).toEqual({ left: 220000, month: '2026-09', reason: 'lowest' });
    expect(two.e).toBe(125000);
    expect(two.low?.left).toBeLessThanOrEqual(two.typicalLeft as number);
    const one = typicalOf(input({ history: [everydayMonth('2026-09', 100000)] }));
    expect(one.low).toEqual({ left: 270000, month: '2026-09', reason: 'only_month' });
  });

  it('nothing at all: no E, no typical month, no low', () => {
    const r = typicalOf(input());
    expect(r.e).toBeNull();
    expect(r.typicalLeft).toBeNull();
    expect(r.low).toBeNull();
    expect(r.monthsUsed).toEqual([]);
    expect(r.categoryMonthly).toEqual([]);
  });

  it('only full months before the current month count, and only the newest six', () => {
    const lines = [everydayMonth('2026-10', 999999), { ...everydayMonth('2026-09', 999999), full: false }];
    const old = ['2026-01', '2026-02'].map((m) => everydayMonth(m, 1));
    const r = typicalOf(input({ history: [...old, ...MONTHS6.map((m) => everydayMonth(m, 1000)), ...lines] }));
    expect(r.monthsUsed).toEqual(MONTHS6);
    expect(r.e).toBe(1000);
  });

  it('I14 bounded influence: one month moves E only between the neighbouring order statistics', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 1_000_000_000 }), { minLength: 1, maxLength: 6 }),
        fc.nat(5),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (values, at, replacement) => {
          const idx = at % values.length;
          const run = (vs: readonly number[]): bigint =>
            BigInt(typicalOf(input({ history: vs.map((v, i) => everydayMonth(MONTHS6[i] as string, v, 'normal')) })).e as number);
          const before = run(values);
          const changed = values.map((v, i) => (i === idx ? replacement : v));
          const after = run(changed);
          const others = values.filter((_, i) => i !== idx).map(BigInt);
          if (others.length === 0) return;
          const lo = medianHalfUp([...others, 0n]);
          const hi = medianHalfUp([...others, 10n ** 12n]);
          expect(after >= lo && after <= hi).toBe(true);
          expect(before >= lo && before <= hi).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('I15 low month never above the typical month', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 6 }), (values) => {
        const r = typicalOf(
          input({ history: values.map((v, i) => everydayMonth(MONTHS6[i] as string, v, 'normal')) })
        );
        expect(r.low).not.toBeNull();
        expect(r.low?.left as number).toBeLessThanOrEqual(r.typicalLeft as number);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('I16 order invariance', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 6 }),
        fc.integer(),
        (values, seed) => {
          const months = values.map((v, i) => everydayMonth(MONTHS6[i] as string, v));
          const shuffled = [...months].sort((a, b) => ((a.month.charCodeAt(6) * seed) % 7) - ((b.month.charCodeAt(6) * seed) % 7));
          const rev = [...months].reverse();
          const base = typicalOf(input({ history: months }));
          expect(typicalOf(input({ history: rev }))).toEqual(base);
          expect(typicalOf(input({ history: shuffled }))).toEqual(base);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('I6 marks: out and half are excluded with a reason; normal keeps an under-logged month', () => {
    const base = [everydayMonth('2026-05', 100000), everydayMonth('2026-06', 100000), everydayMonth('2026-07', 100000)];
    const marked = typicalOf(
      input({ history: [...base, everydayMonth('2026-08', 900000, 'out'), everydayMonth('2026-09', 900000, 'half')] })
    );
    expect(marked.e).toBe(100000);
    expect(marked.reasons).toContain('month_excluded_marked');
    expect(marked.monthsUsed).toEqual(['2026-05', '2026-06', '2026-07']);

    const under = typicalOf(input({ history: [...base, everydayMonth('2026-08', 10000)] }));
    expect(under.monthsUsed).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(under.reasons).toContain('month_excluded_under_logged');
    expect(under.notices).toEqual([{ code: 'month_looks_under_logged', values: { month: '2026-08' } }]);

    const normal = typicalOf(input({ history: [...base, everydayMonth('2026-08', 10000, 'normal')] }));
    expect(normal.monthsUsed).toHaveLength(4);
    expect(normal.notices).toEqual([]);

    const exactlyHalf = typicalOf(input({ history: [...base, everydayMonth('2026-08', 50000)] }));
    expect(exactlyHalf.monthsUsed).toHaveLength(4);
  });

  it('a single month is never judged under-logged against nothing', () => {
    const r = typicalOf(input({ history: [everydayMonth('2026-08', 0)] }));
    expect(r.monthsUsed).toEqual(['2026-08']);
    expect(r.notices).toEqual([]);
  });

  it('D-03 yearly bill choice', () => {
    const yearly = (typicalChoice: V3Series['typicalChoice']): V3Series =>
      seriesBill({ id: 'ins', amount: 120000, cadence: { unit: 'month', every: 12 }, typicalChoice });
    const monthly = typicalOf(input({ series: [yearly('monthly')] }));
    expect(monthly.recurringBills).toBe(10000);
    expect(monthly.notices).toEqual([]);
    const excluded = typicalOf(input({ series: [yearly('excluded')] }));
    expect(excluded.recurringBills).toBe(0);
    expect(excluded.notices).toEqual([]);
    const unchosen = typicalOf(input({ series: [yearly(null)] }));
    expect(unchosen.recurringBills).toBe(10000);
    expect(unchosen.notices).toEqual([{ code: 'yearly_bill_choice_needed', values: { seriesId: 'ins' } }]);
    expect(unchosen.reasons).toContain('typical_choice_defaulted');
    const quarterly = seriesBill({ id: 'q', amount: 30000, cadence: { unit: 'month', every: 3 }, typicalChoice: 'monthly' });
    expect(typicalOf(input({ series: [quarterly] })).recurringBills).toBe(10000);
    const weekly = seriesBill({ id: 'w', amount: 1200, cadence: { unit: 'week', every: 1 } });
    const w = typicalOf(input({ series: [weekly] }));
    expect(w.notices).toEqual([]);
    expect(w.recurringBills).toBe(5200);
  });

  it('D-32 rough figures only', () => {
    const rough = { income: mu(300000), expenses: mu(150000), debt: mu(20000), saving: mu(10000), invest: mu(5000), asOf: ASOF };
    const r = typicalOf(input({ rough }));
    expect(r.e).toBe(150000);
    expect(r.typicalLeft).toBe(115000);
    expect(r.low).toBeNull();
    expect(r.reasons).toContain('rough_figures_used');
    expect(r.notices).toEqual([{ code: 'from_your_figures', values: {} }]);
    const withHistory = typicalOf(input({ rough, history: [everydayMonth('2026-09', 80000)] }));
    expect(withHistory.e).toBe(80000);
    expect(withHistory.reasons).not.toContain('rough_figures_used');
    expect(withHistory.notices).toEqual([]);
  });

  it('everyday override replaces E', () => {
    const r = typicalOf({ ...samInput(), everydayOverride: mu(120000) });
    expect(r.e).toBe(120000);
    expect(r.typicalLeft).toBe(70000);
    expect(r.reasons).toContain('everyday_override_used');
    expect(r.low?.left as number).toBeLessThanOrEqual(r.typicalLeft as number);
    const noHistory = typicalOf(input({ everydayOverride: mu(120000) }));
    expect(noHistory.low).toBeNull();
    expect(noHistory.typicalLeft).toBe(250000);
  });

  it('categoryMonthly and housingMonthly', () => {
    const series = [
      seriesBill({ id: 'rent', amount: 150000, categoryId: 'housing', isHousing: true }),
      seriesBill({ id: 'phone', amount: 4000 }),
    ];
    const months = ['2026-07', '2026-08', '2026-09'].map((m, i) =>
      monthOf(m, [
        v3Line({ id: `f${i}`, date: `${m}-03`, amount: [10000, 30000, 20000][i] as number, categoryId: 'food' }),
        v3Line({ id: `o${i}`, date: `${m}-04`, amount: 5000 }),
      ])
    );
    const r = typicalOf(input({ history: months, series }));
    expect(r.categoryMonthly).toEqual([
      { categoryId: 'food', amount: 20000 },
      { categoryId: 'housing', amount: 150000 },
    ]);
    expect(r.housingMonthly).toBe(150000);
    expect(r.recurringBills).toBe(154000);
  });

  it('categoryMonthly with no history is the bills alone', () => {
    const r = typicalOf(input({ series: [seriesBill({ id: 'rent', amount: 150000, categoryId: 'housing' })] }));
    expect(r.categoryMonthly).toEqual([{ categoryId: 'housing', amount: 150000 }]);
  });

  it('ended and dismissed bills do not count', () => {
    const series = [
      seriesBill({ id: 'old', amount: 5000, endDate: '2026-06-01' }),
      seriesBill({ id: 'no', amount: 5000, status: 'dismissed' }),
      seriesBill({ id: 'un', amount: 5000, confirmed: false }),
    ];
    expect(typicalOf(input({ series })).recurringBills).toBe(0);
  });
});

describe('typicalOf: window and recorded income (05.1-43)', () => {
  const MONTHS12 = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const everydays = [20000, 20000, 40000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000];
  const history12 = MONTHS12.map((m, i) => everydayMonth(m, everydays[i] as number));
  const incomes = new Map<string, bigint>(MONTHS12.map((m, i) => [m, i < 7 ? 70000n : 145000n]));

  it('D-33 windowMonths widens the history used; the default stays 6', () => {
    expect(typicalOf(input({ history: history12 })).monthsUsed).toHaveLength(6);
    const wide = typicalOf(input({ history: history12, windowMonths: 12 }));
    expect(wide.monthsUsed).toEqual(MONTHS12);
    expect(wide.used).toHaveLength(12);
    expect(wide.used[0]?.month).toBe('2026-09'); // newest first
  });

  it('D-36 with recorded income the typical income is the window median and each low candidate uses its own income', () => {
    const r = typicalOf(input({ history: history12, windowMonths: 12, incomeByMonth: incomes, setAside: mu(0) }));
    // sorted incomes: 7 x 70000 then 5 x 145000; median of the 6th and 7th = 70000
    expect(r.typicalIncome).toBe(70000);
    expect(r.e).toBe(20000);
    expect(r.typicalLeft).toBe(50000);
    // lefts: Dec 70000-40000 = 30000 (lowest), then 70000-20000 = 50000 x6, then 125000 x5: second-lowest 50000, clamped to typicalLeft
    expect(r.low).toEqual({ left: 50000, month: '2025-10', reason: 'second_lowest' });
  });

  it('D-36 a window month with no recorded income counts as income 0', () => {
    const r = typicalOf(input({ history: history12.slice(9), windowMonths: 12, incomeByMonth: new Map(), setAside: mu(0) }));
    expect(r.typicalIncome).toBe(0);
    expect(r.typicalLeft).toBe(-20000);
    expect(r.low?.left).toBe(-20000);
  });

  it('D-36 a steady earner (no income map) keeps the supplied typical income', () => {
    const r = typicalOf(input({ history: history12 }));
    expect(r.typicalIncome).toBe(400000);
  });

  it('D-36 an income map with no usable month keeps the supplied typical income', () => {
    const r = typicalOf(input({ incomeByMonth: new Map(), windowMonths: 12 }));
    expect(r.typicalIncome).toBe(400000);
    expect(r.low).toBeNull();
  });
});
