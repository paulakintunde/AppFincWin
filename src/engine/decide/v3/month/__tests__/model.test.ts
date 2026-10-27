import { minorUnits } from '../../../../money/types';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { inputsOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import type { V3Inputs, V3Month } from '../../types';
import { buildMonthModel, setAsideOf } from '../model';

const mu = minorUnits;
const sam = (over: Partial<V3Inputs> = {}): V3Inputs => toV3Inputs(personById('sam'), over);
const YEARLY = { unit: 'month', every: 12 } as const;
const MONTHLY = { unit: 'month', every: 1 } as const;

function withOctLines(base: V3Inputs, lines: ReturnType<typeof v3Line>[]): V3Inputs {
  return {
    ...base,
    months: base.months.map((m): V3Month => (m.month === '2026-10' ? { ...m, lines: [...m.lines, ...lines] } : m)),
  };
}

describe('buildMonthModel', () => {
  it('v3 §12 #19 yearly insurance with typicalChoice monthly', () => {
    const base = sam();
    const m = buildMonthModel({
      ...base,
      series: [
        ...base.series,
        v3Series({ id: 'ins', role: 'bill', cadence: YEARLY, anchorDate: '2026-03-01', amount: 120000, typicalChoice: 'monthly' }),
      ],
    });
    expect(m.typicalLeft).toBe(32500);
  });

  it('v3 §12 #20 a raise lifts typicalLeft at once', () => {
    const base = sam();
    const m = buildMonthModel({
      ...base,
      series: base.series.map((s) => (s.id === 'sam-pay' ? { ...s, amount: mu(430000) } : s)),
    });
    expect(m.typicalLeft).toBe(72500);
  });

  it('I19 a debt minimum counts once, as set-aside', () => {
    const base = sam();
    const debt = { id: 'd1', kind: 'loan' as const, balance: mu(500000), minimum: mu(20000), apr: null, secured: false, isHousing: false };
    const without = buildMonthModel({ ...base, debts: [debt] });
    const paid = buildMonthModel(
      withOctLines({ ...base, debts: [debt] }, [v3Line({ id: 'dp', date: '2026-10-02', amount: 20000, role: 'debt_payment' })])
    );
    const plain = buildMonthModel(base);
    expect(without.setAside).toBe(50000);
    expect(without.moneyOut).toBe((plain.moneyOut as number) + 20000);
    expect(paid.moneyOut).toBe(without.moneyOut);
    expect(paid.billsPaid).toBe(plain.billsPaid);
    expect(paid.everydayLogged).toBe(plain.everydayLogged);
  });

  it('flexible saving adds nothing; fixed investing adds its monthly equivalent', () => {
    const base = sam();
    const flex = v3Series({ id: 'fx', role: 'saving', cadence: MONTHLY, anchorDate: '2026-04-09', amount: 50000, savingMode: 'flexible' });
    const inv = v3Series({ id: 'iv', role: 'investing', cadence: MONTHLY, anchorDate: '2026-04-09', amount: 10000, savingMode: 'fixed' });
    expect(setAsideOf({ ...base, series: [...base.series, flex] })).toBe(30000);
    expect(setAsideOf({ ...base, series: [...base.series, inv] })).toBe(40000);
  });

  it('I34 unconfirmed candidates never reach the month', () => {
    const base = sam();
    const plain = buildMonthModel(base);
    const ghost = v3Series({ id: 'ghost', role: 'pay', cadence: MONTHLY, anchorDate: '2026-04-02', amount: 100000, confirmed: false });
    const m = buildMonthModel(
      withOctLines({ ...base, series: [...base.series, ghost] }, [
        v3Line({ id: 'g1', date: '2026-10-02', amount: 100000, role: 'income', seriesId: 'ghost' }),
      ])
    );
    expect(m.moneyIn).toBe(plain.moneyIn);
    expect(m.typicalIncome).toBe(plain.typicalIncome);
  });

  it('I16 month order does not matter', () => {
    const base = sam();
    expect(buildMonthModel({ ...base, months: [...base.months].reverse() })).toEqual(buildMonthModel(base));
  });

  it('a short typical month and short this month raise notices in a fixed order', () => {
    const base = sam({ everydayOverride: mu(500000), unsavedWrites: 2 });
    const m = buildMonthModel(
      withOctLines(base, [v3Line({ id: 'big', date: '2026-10-02', amount: 20000, role: 'spending', categoryId: 'food' })])
    );
    expect(m.typicalLeft).toBeLessThan(0);
    expect(m.monthLeft).toBeLessThan(0);
    expect(m.notices.map((n) => n.code)).toEqual(['typical_short', 'month_heading_short', 'unsaved_changes']);
    expect(m.notices[1]?.values).toMatchObject({ categoryId: 'food', largest: 20000 });
    expect(m.reasons).toContain('everyday_override_used');
    expect(m.confidence.reasons).toContain('unsaved_changes');
  });

  it('month_heading_short carries nulls when nothing is categorised', () => {
    const m = buildMonthModel(sam({ everydayOverride: mu(900000) }));
    const n = m.notices.find((x) => x.code === 'month_heading_short');
    expect(n?.values).toMatchObject({ month: '2026-10' });
    expect(n?.values).not.toHaveProperty('categoryId');
    expect(n?.values).not.toHaveProperty('largest');
    expect(Number(n?.values.short)).toBeGreaterThan(0);
  });

  it('month_heading_short with no everyday line at all has no largest line', () => {
    const base = sam({ everydayOverride: mu(900000) });
    const m = buildMonthModel({
      ...base,
      months: base.months.map((mo) =>
        mo.month === '2026-10' ? { ...mo, lines: mo.lines.filter((l) => l.id !== 'sam-e-10-1') } : mo
      ),
    });
    expect(m.largestLine).toBeNull();
    const n = m.notices.find((x) => x.code === 'month_heading_short');
    expect(n?.values).not.toHaveProperty('categoryId');
    expect(n?.values).not.toHaveProperty('largest');
  });

  it('a yearly bill with no choice yet asks once and passes through', () => {
    const base = sam();
    const m = buildMonthModel({
      ...base,
      series: [...base.series, v3Series({ id: 'ins', role: 'bill', cadence: YEARLY, anchorDate: '2026-03-01', amount: 120000 })],
    });
    expect(m.notices.map((n) => n.code)).toContain('yearly_bill_choice_needed');
    expect(m.reasons).toContain('typical_choice_defaulted');
  });

  it('rough figures only: from_your_figures and a rough confidence', () => {
    const m = buildMonthModel(
      inputsOf({
        asOf: '2026-10-03',
        rough: {
          income: mu(400000),
          expenses: mu(150000),
          saving: mu(30000),
          debt: mu(0),
          invest: mu(0),
          asOf: '2026-10-01',
        },
      })
    );
    expect(m.notices.map((n) => n.code)).toContain('from_your_figures');
    expect(m.confidence.level).toBe('rough');
    expect(m.confidence.reasons).toContain('rough_figures');
    expect(m.typicalLeft).toBe(220000);
  });

  it('no data at all: no current month, no E, nothing thrown', () => {
    const m = buildMonthModel(inputsOf());
    expect(m.e).toBeNull();
    expect(m.typicalLeft).toBeNull();
    expect(m.low).toBeNull();
    expect(m.monthLeft).toBe(0);
  });

  it('an unmarked other-income kind raises income_kind_unmarked', () => {
    const base = sam();
    const m = buildMonthModel({
      ...base,
      series: [
        ...base.series,
        v3Series({ id: 'div', role: 'other_income', cadence: MONTHLY, anchorDate: '2026-04-20', amount: 5000, incomeKind: { kind: 'preset', value: 'dividends' } }),
      ],
    });
    expect(m.notices.map((n) => n.code)).toContain('income_kind_unmarked');
  });
});

describe('buildMonthModel: variable and seasonal income (05.1-43)', () => {
  const PAY_SERIES = v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2025-01-01', amount: 70000 });
  const incomeOf = (m: string): number => (['05', '06', '07', '08', '09'].includes(m.slice(5)) ? 145000 : 70000);
  const everydayOf = (m: string): number => (m.endsWith('-12') ? 50000 : 30000);
  const ymAdd = (start: string, i: number): string => {
    const total = Number(start.slice(5)) - 1 + i;
    return `${Number(start.slice(0, 4)) + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  };
  function history(start: string, count: number, income: (m: string) => number = incomeOf): V3Month[] {
    return Array.from({ length: count }, (_, i): V3Month => {
      const m = ymAdd(start, i);
      return {
        month: m,
        full: true,
        mark: null,
        lines: [
          v3Line({ id: `p-${m}`, date: `${m}-01`, amount: income(m), role: 'income', seriesId: 'pay' }),
          v3Line({ id: `e-${m}`, date: `${m}-15`, amount: everydayOf(m) }),
        ],
      };
    });
  }
  const EMPTY_DEC: V3Month = { month: '2026-12', full: false, mark: null, lines: [] };
  const VARIABLE = { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'variable' } as const;
  const person = (over: Partial<V3Inputs> = {}): V3Inputs =>
    inputsOf({
      asOf: '2026-12-10',
      series: [PAY_SERIES],
      months: [...history('2025-10', 14), { month: '2026-12', full: false, mark: null, lines: [v3Line({ id: 'e-now', date: '2026-12-02', amount: 5000 })] }],
      profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'seasonal' },
      ...over,
    });

  it('D-33 D-35 D-36 D-39 D-46 a seasonal earner in December: 12-month window, last December, income from the records', () => {
    const m = buildMonthModel(person());
    expect(m.incomePicture).toMatchObject({
      stated: 'seasonal',
      treated: 'seasonal',
      swings: true,
      confirmNeeded: false,
      windowMonths: 12,
      fullMonths: 14,
      expectedThisMonth: 70000,
    });
    expect(m.incomePicture?.months).toHaveLength(12);
    expect(m.incomePicture?.months.filter((x) => x.lean)).toHaveLength(7);
    expect(m.incomePicture?.leanLeft).toBe(20000); // lowest lean leftover: December, 70000 - 50000
    expect(m.typicalIncome).toBe(70000); // D-36: the median recorded income, not the pay series
    expect(m.e).toBe(30000);
    expect(m.typicalLeft).toBe(40000);
    expect(m.low).toMatchObject({ left: 40000, reason: 'second_lowest' });
    expect(m.moneyIn).toBe(70000); // D-35: nothing arrived yet; last December is expected
    expect(m.erest).toBe(45000); // D-39: December everyday 50000 less 5000 logged
    expect(m.reasons).toEqual(expect.arrayContaining(['long_history_window', 'same_season_spending']));
    expect(m.reasons).not.toContain('expected_income_used');
    expect(m.notices).toEqual([
      { code: 'history_window_12', values: { months: 12 } },
      { code: 'income_from_expected', values: { month: '2026-12', amount: 70000, source: 'last_year', sameMonth: '2025-12' } },
      { code: 'same_season_compared', values: { lastYear: '2025-12', everyday: 50000 } },
    ]);
    expect(m.unseenPay).toEqual([{ seriesId: 'pay', date: '2026-12-01', amount: 70000, arrived: null }]); // D-58
  });

  it('D-46 D-35 a confirmed figure is used as given and named as the source', () => {
    const m = buildMonthModel(
      person({
        profile: VARIABLE,
        months: [...history('2026-04', 8), EMPTY_DEC],
        expectedIncome: [{ month: '2026-12', amount: mu(120000), at: '2026-12-01' }],
      })
    );
    expect(m.moneyIn).toBe(120000);
    expect(m.reasons).toContain('expected_income_used');
    expect(m.notices.find((n) => n.code === 'income_from_expected')).toEqual({
      code: 'income_from_expected',
      values: { month: '2026-12', amount: 120000, source: 'confirmed' },
    });
  });

  it('D-35 variable with 8 full months and no confirmed figure: no expected income, money in as today', () => {
    const m = buildMonthModel(person({ profile: VARIABLE, months: [...history('2026-04', 8), EMPTY_DEC] }));
    expect(m.incomePicture?.expectedThisMonth).toBeNull();
    expect(m.incomePicture?.windowMonths).toBe(12);
    expect(m.moneyIn).toBe(0); // the 12-01 pay is unseen: D-58 asks, nothing is guessed
    expect(m.notices.map((n) => n.code).filter((c) => c !== 'month_heading_short')).toEqual(['history_window_12']);
    expect(m.reasons).not.toContain('same_season_spending');
  });

  it('D-35 variable with 12 full months: the second-lowest month is expected', () => {
    const m = buildMonthModel(person({ profile: VARIABLE, months: [...history('2025-12', 12), EMPTY_DEC] }));
    expect(m.incomePicture?.expectedThisMonth).toBe(70000);
    expect(m.notices.find((n) => n.code === 'income_from_expected')?.values).toEqual({ month: '2026-12', amount: 70000, source: 'low' });
    expect(m.reasons).toContain('same_season_spending'); // D-39 applies to variable earners too
    expect(m.notices.some((n) => n.code === 'same_season_compared')).toBe(true);
  });

  it('D-34 swings with no stated pattern: treated variable and confirmation needed; a stated pattern is not relabelled', () => {
    const unstated = buildMonthModel(person({ profile: null }));
    expect(unstated.incomePicture).toMatchObject({ stated: null, treated: 'variable', swings: true, confirmNeeded: true, windowMonths: 12 });
    const confirmed = buildMonthModel(
      person({ profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'steady', patternConfirmed: true } })
    );
    expect(confirmed.incomePicture).toMatchObject({ stated: 'steady', treated: 'steady', swings: true, confirmNeeded: false, windowMonths: 6, months: [] });
    expect(confirmed.notices.some((n) => n.code === 'history_window_12')).toBe(false);
  });

  it('D-48 volatile only for a variable or seasonal earner whose window income CV reaches the limit', () => {
    const wide = (m: string): number => (m.endsWith('-03') || m.endsWith('-04') ? 400000 : 30000);
    const v = buildMonthModel(person({ months: [...history('2025-10', 14, wide), EMPTY_DEC] }));
    expect(v.incomePicture?.volatile).toBe(true);
    expect(buildMonthModel(person()).incomePicture?.volatile).toBe(false); // CV about 36%
  });

  it('D-35 when more has arrived than is expected, money in is what arrived and no notice is added', () => {
    const m = buildMonthModel(
      person({
        months: [
          ...history('2025-10', 14),
          { month: '2026-12', full: false, mark: null, lines: [v3Line({ id: 'big', date: '2026-12-01', amount: 200000, role: 'income', seriesId: 'pay' })] },
        ],
      })
    );
    expect(m.incomePicture?.expectedThisMonth).toBe(70000);
    expect(m.moneyIn).toBe(200000);
    expect(m.notices.some((n) => n.code === 'income_from_expected')).toBe(false);
    expect(m.unseenPay).toBeUndefined();
  });

  it('D-39 D-35 fewer than 12 full months: no records figure and no same-season comparison', () => {
    const m = buildMonthModel(person({ months: [...history('2026-01', 11), EMPTY_DEC] }));
    expect(m.incomePicture).toMatchObject({ treated: 'seasonal', fullMonths: 11, expectedThisMonth: null });
    expect(m.reasons).not.toContain('same_season_spending');
    expect(m.notices.map((n) => n.code).filter((c) => c !== 'month_heading_short')).toEqual(['history_window_12']);
  });

  it('a steady earner gets the plain picture and none of the D-46 notices', () => {
    const m = buildMonthModel(sam());
    expect(m.incomePicture).toEqual({
      stated: null,
      treated: 'steady',
      swings: false,
      volatile: false,
      confirmNeeded: false,
      windowMonths: 6,
      fullMonths: expect.any(Number),
      months: [],
      leanLeft: null,
      expectedThisMonth: null,
    });
    expect(m.notices.some((n) => ['history_window_12', 'income_from_expected', 'same_season_compared'].includes(n.code))).toBe(false);
    expect(m.reasons).not.toContain('long_history_window');
  });
});
