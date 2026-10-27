import { assert as fcAssert, array, integer, property } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import type {
  CustomOptions,
  ExpectedMonthIncome,
  IncomeMonth,
  IncomePicture,
  Schedule,
  V3Month,
  V3Series,
} from '../../types';
import { monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import {
  buildIncomeMonths,
  dependsOnMonths,
  expectedFor,
  incomeCvAtLeast,
  incomeSwings,
  isLeanMonth,
  isVolatile,
  leanLeftOf,
  leanRun,
  newestIncomes,
  recordedIncomeByMonth,
  resolvePattern,
  sameCalendarMonth,
  seasonEveryday,
  windowMonthsOf,
  type PictureView,
} from '../incomePattern';
import type { EverydayMonth } from '../typical';

const NO_CUSTOM: CustomOptions = { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] };
const MONTHLY = { unit: 'month', every: 1 } as const;

function ym(i: number): string {
  // i = 0 -> 2025-10 ... i = 11 -> 2026-09
  const total = 9 + i;
  return `${2025 + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const SEASON_INCOME = (m: string): bigint => (['05', '06', '07', '08', '09'].includes(m.slice(5)) ? 145000n : 70000n);

function everydayMonths(n: number, everyday = 30000): EverydayMonth[] {
  return Array.from({ length: n }, (_, i) => ({
    month: ym(i),
    everyday: mu(everyday),
    mark: null,
    byCategory: new Map<string, bigint>(),
  }));
}

function seasonalMonths(): IncomeMonth[] {
  const used = everydayMonths(12);
  const byMonth = new Map(used.map((u) => [u.month, SEASON_INCOME(u.month)]));
  return buildIncomeMonths(used, byMonth, 20000n, 5000n);
}

const view = (over: Partial<PictureView> = {}): PictureView => ({ treated: 'seasonal', fullMonths: 12, months: seasonalMonths(), ...over });

describe('incomeCvAtLeast / incomeSwings', () => {
  it('D-34 steady incomes do not swing; wide ones do; fewer than 3 months or a zero total never do', () => {
    expect(incomeSwings([300000n, 300000n, 300000n])).toBe(false);
    expect(incomeSwings([100000n, 300000n, 500000n])).toBe(true);
    expect(incomeSwings([100000n, 500000n])).toBe(false);
    expect(incomeSwings([0n, 0n, 0n])).toBe(false);
  });

  it('D-48 exactly at 38% is volatile, just below is not (CV 37% -> false, 38% -> true)', () => {
    // incomes 100 -x, 100 +x, 100 over 3 months: sigma^2 = 2x^2/3; CV = sigma / 100
    // CV 38% exact is impossible with integers, so use a scaled pair: n=4, values 62 62 138 138 -> mean 100, sigma 38 -> CV exactly 38%
    const exact = [62n, 62n, 138n, 138n];
    expect(incomeCvAtLeast(exact, 38)).toBe(true);
    expect(incomeCvAtLeast(exact, 39)).toBe(false);
    const below = [63n, 63n, 137n, 137n]; // sigma 37
    expect(incomeCvAtLeast(below, 38)).toBe(false);
    expect(incomeCvAtLeast(below, 37)).toBe(true);
  });

  it('D-34 the swing test is scale-free (property)', () => {
    fcAssert(
      property(array(integer({ min: 1, max: 5000 }), { minLength: 3, maxLength: 12 }), integer({ min: 1, max: 50 }), (xs, k) => {
        const a = xs.map(BigInt);
        const b = a.map((x) => x * BigInt(k));
        return incomeSwings(a) === incomeSwings(b);
      }),
      { seed: 0x0533, numRuns: 100 }
    );
  });
});

describe('resolvePattern', () => {
  it('D-34 an unstated pattern with swings is treated variable and flagged', () => {
    expect(resolvePattern(null, true)).toEqual({ stated: null, treated: 'variable', confirmNeeded: true });
  });
  it('D-34 steady and confirmed stands; steady unconfirmed with swings is flagged', () => {
    expect(resolvePattern({ pattern: 'steady', patternConfirmed: true }, true)).toEqual({ stated: 'steady', treated: 'steady', confirmNeeded: false });
    expect(resolvePattern({ pattern: 'steady' }, true)).toEqual({ stated: 'steady', treated: 'variable', confirmNeeded: true });
  });
  it('D-34 a stated variable or seasonal pattern is never relabelled', () => {
    expect(resolvePattern({ pattern: 'seasonal' }, false)).toEqual({ stated: 'seasonal', treated: 'seasonal', confirmNeeded: false });
    expect(resolvePattern({ pattern: 'variable' }, true)).toEqual({ stated: 'variable', treated: 'variable', confirmNeeded: false });
  });
  it('D-34 no swings is steady', () => {
    expect(resolvePattern(null, false)).toEqual({ stated: null, treated: 'steady', confirmNeeded: false });
  });
});

describe('windowMonthsOf', () => {
  it('D-33 steady 6, variable and seasonal 12', () => {
    expect(windowMonthsOf('steady')).toBe(6);
    expect(windowMonthsOf('variable')).toBe(12);
    expect(windowMonthsOf('seasonal')).toBe(12);
  });
});

describe('recordedIncomeByMonth / newestIncomes', () => {
  const pay: V3Series = v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-01', amount: 100000 });
  const history: V3Month[] = [
    monthOf('2026-07', [v3Line({ id: 'a', date: '2026-07-01', amount: 100000, role: 'income', seriesId: 'pay' }), v3Line({ id: 'b', date: '2026-07-09', amount: 5000, role: 'income' })]),
    monthOf('2026-08', [v3Line({ id: 'c', date: '2026-08-01', amount: 120000, role: 'income', seriesId: 'pay' }), v3Line({ id: 'p', date: '2026-08-02', amount: 9999, role: 'income', seriesId: 'pay', status: 'pending' })]),
    monthOf('2026-09', [], { full: false }),
    monthOf('2026-10', [v3Line({ id: 'd', date: '2026-10-01', amount: 1, role: 'income', seriesId: 'pay' })]),
    monthOf('2026-06', [v3Line({ id: 'e', date: '2026-06-01', amount: 7777, role: 'spending' })]),
  ];

  it('D-35 sums paid eligible income lines of full months before the current month', () => {
    const m = recordedIncomeByMonth({ asOf: '2026-10-03', history, series: [pay], profile: null, custom: NO_CUSTOM });
    expect(m.get('2026-07')).toBe(100000n); // the untyped 5000 line does not count without a kind
    expect(m.get('2026-08')).toBe(120000n); // pending ignored
    expect(m.get('2026-06')).toBe(0n);
    expect(m.has('2026-09')).toBe(false); // not full
    expect(m.has('2026-10')).toBe(false); // the current month
  });

  it('newestIncomes returns the newest n, oldest first', () => {
    const map = new Map<string, bigint>([['2026-01', 1n], ['2026-02', 2n], ['2026-03', 3n]]);
    expect(newestIncomes(map, 2)).toEqual([2n, 3n]);
    expect(newestIncomes(map, 12)).toEqual([1n, 2n, 3n]);
  });
});

describe('buildIncomeMonths / leanLeftOf', () => {
  it('D-36 lean months are those below the window average; leanLeft is the lowest leftover among them', () => {
    const months = seasonalMonths();
    expect(months).toHaveLength(12);
    const lean = months.filter((m) => m.lean);
    expect(lean).toHaveLength(7); // the 7 low months
    expect(lean.every((m) => m.income === 70000)).toBe(true);
    expect(months[0]?.month).toBe('2025-10'); // oldest first
    // left = income - bills - everyday - set-aside = 70000 - 20000 - 30000 - 5000
    expect(leanLeftOf(months)).toBe(15000);
  });
  it('D-36 a month with no recorded income is income 0; leanLeft is null with no lean month', () => {
    const used = everydayMonths(3);
    const flat = buildIncomeMonths(used, new Map(used.map((u) => [u.month, 50000n])), 0n, 0n);
    expect(flat.some((m) => m.lean)).toBe(false);
    expect(leanLeftOf(flat)).toBeNull();
    const missing = buildIncomeMonths([...used].reverse(), new Map([[used[0]!.month, 90000n]]), 0n, 0n);
    expect(missing.map((m) => m.income)).toEqual([90000, 0, 0]);
    expect(missing.map((m) => m.lean)).toEqual([false, true, true]);
    expect(leanLeftOf(missing)).toBe(-30000);
  });
});

describe('sameCalendarMonth', () => {
  const m = (month: string): IncomeMonth => ({ month, income: mu(1), everyday: mu(1), left: mu(0), lean: false });
  it('D-39 picks the most recent window month with the same calendar month, never the month itself', () => {
    const asc = [m('2024-12'), m('2025-12'), m('2026-01')];
    expect(sameCalendarMonth(asc, '2026-12')?.month).toBe('2025-12');
    expect(sameCalendarMonth([...asc].reverse(), '2026-12')?.month).toBe('2025-12');
    expect(sameCalendarMonth(asc, '2025-12')?.month).toBe('2024-12');
    expect(sameCalendarMonth(asc, '2026-03')).toBeNull();
  });
});

describe('expectedFor', () => {
  const confirmedFor = (month: string, amount: number, at = '2026-10-01'): ExpectedMonthIncome => ({ month, amount: mu(amount), at });

  it('D-35 a confirmed figure for the month is used as given and wins', () => {
    expect(expectedFor(view(), [confirmedFor('2026-10', 99000)], '2026-10')).toEqual({ amount: 99000, source: 'confirmed' });
    expect(expectedFor(view({ treated: 'steady' }), [confirmedFor('2026-10', 99000)], '2026-10')).toEqual({ amount: 99000, source: 'confirmed' });
  });
  it('D-35 the latest of two confirmed entries stands, in either order; other months and invalid figures are ignored', () => {
    const a = confirmedFor('2026-10', 1000, '2026-09-01');
    const b = confirmedFor('2026-10', 2000, '2026-10-01');
    expect(expectedFor(view(), [a, b], '2026-10')?.amount).toBe(2000);
    expect(expectedFor(view(), [b, a], '2026-10')?.amount).toBe(2000);
    const bad = [
      { month: '2026-10', amount: -5 as never, at: '2026-10-01' },
      { month: '2026-10', amount: 1.5 as never, at: '2026-10-01' },
      confirmedFor('2026-11', 5000),
    ];
    expect(expectedFor(view({ treated: 'steady' }), bad, '2026-10')).toBeNull();
  });
  it('D-35 a steady earner or fewer than 12 full months gets no records figure', () => {
    expect(expectedFor(view({ treated: 'steady' }), [], '2026-10')).toBeNull();
    expect(expectedFor(view({ fullMonths: 11 }), [], '2026-10')).toBeNull();
  });
  it('D-35 seasonal: the same month last year; none when the window lacks it', () => {
    expect(expectedFor(view(), [], '2026-10')).toEqual({ amount: 70000, source: 'records' });
    expect(expectedFor(view(), [], '2027-06')).toEqual({ amount: 145000, source: 'records' });
    expect(expectedFor(view({ months: [] }), [], '2026-10')).toBeNull();
  });
  it('D-35 variable: the second-lowest window income (lowest when fewer than 3)', () => {
    const v = view({ treated: 'variable' });
    expect(expectedFor(v, [], '2026-10')).toEqual({ amount: 70000, source: 'records' });
    const three = buildIncomeMonths(everydayMonths(3), new Map([[ym(0), 30000n], [ym(1), 50000n], [ym(2), 90000n]]), 0n, 0n);
    expect(expectedFor(view({ treated: 'variable', months: three }), [], '2026-10')?.amount).toBe(50000);
    const two = three.slice(0, 2);
    expect(expectedFor(view({ treated: 'variable', months: two }), [], '2026-10')?.amount).toBe(30000);
    expect(expectedFor(view({ treated: 'variable', months: [] }), [], '2026-10')).toBeNull();
  });
});

describe('seasonEveryday / isLeanMonth', () => {
  it('D-39 same month last year with 12 months of records; else null', () => {
    expect(seasonEveryday(view(), '2026-12')).toBe(30000);
    expect(seasonEveryday(view({ fullMonths: 11 }), '2026-12')).toBeNull();
    expect(seasonEveryday(view({ treated: 'steady' }), '2026-12')).toBeNull();
    expect(seasonEveryday(view({ months: [] }), '2026-12')).toBeNull();
  });
  it('D-37 lean follows the same calendar month in the window; unknown months are not lean', () => {
    const p: Pick<IncomePicture, 'months'> = { months: seasonalMonths() };
    expect(isLeanMonth(p, '2026-12')).toBe(true);
    expect(isLeanMonth(p, '2026-07')).toBe(false);
    expect(isLeanMonth({ months: [] }, '2026-07')).toBe(false);
  });
});

describe('dependsOnMonths', () => {
  const plan = (count: number, firstDate: string): Schedule =>
    ({
      cadence: MONTHLY,
      count,
      payment: mu(100),
      finalPayment: mu(100),
      lastPaying: count,
      firstDate,
      fees: { perPeriod: mu(0), end: mu(0) },
    }) as unknown as Schedule;

  it('D-35 D-37 a monthly plan reaches 12 months from the current one', () => {
    const months = dependsOnMonths('2026-10-03', plan(18, '2026-11-03'), mu(0));
    expect(months).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09']);
  });
  it('D-37 a one-off is the current month only', () => {
    expect(dependsOnMonths('2026-10-03', null, mu(0))).toEqual(['2026-10']);
  });
  it('D-37 a running monthly cost adds the next 11 months', () => {
    const months = dependsOnMonths('2026-10-03', null, mu(500));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-10');
    expect(months[11]).toBe('2027-09');
  });
  it('D-37 a short plan covers only its own months', () => {
    expect(dependsOnMonths('2026-10-03', plan(2, '2026-10-03'), mu(0))).toEqual(['2026-10', '2026-11']);
  });
});

describe('leanRun', () => {
  const months = seasonalMonths(); // lean: Oct-Apr
  const horizon = (from: string, n: number): string[] =>
    Array.from({ length: n }, (_, i) => {
      const t = Number(from.slice(5)) - 1 + i;
      return `${2026 + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    });
  it('D-37 counts the lean run from October', () => {
    expect(leanRun({ months }, horizon('2026-10', 12))).toBe(7);
  });
  it('D-37 starting in the good season skips to the next lean run', () => {
    expect(leanRun({ months }, horizon('2026-06', 12))).toBe(7);
  });
  it('D-37 no lean months is 0', () => {
    expect(leanRun({ months: [] }, horizon('2026-10', 12))).toBe(0);
    expect(leanRun({ months }, [])).toBe(0);
  });
  it('D-37 stops at the first non-lean month after the run', () => {
    expect(leanRun({ months }, ['2026-10', '2026-11', '2026-06', '2026-12'])).toBe(2);
  });
});

describe('isVolatile', () => {
  const incomes = (xs: number[]): IncomeMonth[] => xs.map((x, i) => ({ month: ym(i), income: mu(x), everyday: mu(0), left: mu(0), lean: false }));
  it('D-48 steady is never volatile; variable at or above the limit is', () => {
    const wide = incomes([62, 62, 138, 138]);
    expect(isVolatile('steady', wide)).toBe(false);
    expect(isVolatile('variable', wide)).toBe(true);
    expect(isVolatile('seasonal', incomes([63, 63, 137, 137]))).toBe(false);
  });
});
