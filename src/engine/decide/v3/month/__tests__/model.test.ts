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
