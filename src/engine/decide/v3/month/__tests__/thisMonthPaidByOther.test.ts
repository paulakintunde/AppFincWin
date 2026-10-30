import { minorUnits as mu } from '../../../../money/types';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import type { IncomeThisMonth, ReadinessWaiver, SkippedOccurrence, V3Inputs, V3Line } from '../../types';
import { dueDrops } from '../dueDrops';
import { buildMonthModel } from '../model';
import { thisMonth } from '../thisMonth';

const MONTHLY = { unit: 'month', every: 1 } as const;
const rent = v3Series({ id: 'rent', name: 'Rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-01', amount: 90000 });
const netflix = v3Series({ id: 'netflix', name: 'Netflix', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-03', amount: 1199 });
const lunch = v3Series({ id: 'lunch', name: 'Lunch', role: 'bill', cadence: { unit: 'week', every: 2 }, anchorDate: '2026-10-05', amount: 1000 });
const gym = v3Series({ id: 'gym', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-20', amount: 4000 });
const old = v3Series({ id: 'old', name: 'Old', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-07', amount: 2500, endDate: '2026-06-30' });
const pay = v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-02', amount: 400000 });

function inputs(over: { waivers?: ReadinessWaiver[]; skipped?: SkippedOccurrence[]; lines?: V3Line[] } = {}): V3Inputs {
  return inputsOf({
    asOf: '2026-10-30',
    series: [rent, netflix, lunch, gym, old, pay],
    months: [
      monthOf('2026-10', [v3Line({ id: 'p10', date: '2026-10-02', amount: 400000, role: 'income', seriesId: 'pay' }), ...(over.lines ?? [])]),
    ],
    ...(over.waivers === undefined ? {} : { waivers: over.waivers }),
    ...(over.skipped === undefined ? {} : { skipped: over.skipped }),
  });
}

const base = buildMonthModel(inputs());

describe('this month without dropped dues (D-27, D-31)', () => {
  it('baseline: every bill this month is still to come and nothing is listed', () => {
    expect(base.billsDue).toBe(90000 + 1199 + 2000 + 4000);
    expect(base.paidByOther).toBeUndefined();
    expect(base.alwaysOther).toBeUndefined();
  });

  it('paid_by_other drops the rent from still to come and money out, and raises monthLeft', () => {
    const m = buildMonthModel(inputs({ waivers: [{ kind: 'paid_by_other', seriesId: 'rent', date: '2026-10-01' }] }));
    expect(m.billsDue).toBe(base.billsDue - 90000);
    expect(m.moneyOut).toBe(base.moneyOut - 90000);
    expect(m.monthLeft).toBe(base.monthLeft + 90000);
    expect(m.billsPaid).toBe(base.billsPaid);
    expect(m.paidByOther).toEqual([{ seriesId: 'rent', name: 'Rent', date: '2026-10-01', amount: 90000, by: 'paid_by_other' }]);
    expect(m.alwaysOther).toBeUndefined();
  });

  it('always_other drops both fortnightly Lunch dues and lists them', () => {
    const m = buildMonthModel(inputs({ waivers: [{ kind: 'always_other', seriesId: 'lunch' }] }));
    expect(m.billsDue).toBe(base.billsDue - 2000);
    expect(m.monthLeft).toBe(base.monthLeft + 2000);
    expect(m.paidByOther).toEqual([
      { seriesId: 'lunch', name: 'Lunch', date: '2026-10-05', amount: 1000, by: 'always_other' },
      { seriesId: 'lunch', name: 'Lunch', date: '2026-10-19', amount: 1000, by: 'always_other' },
    ]);
    expect(m.alwaysOther).toEqual([{ seriesId: 'lunch', name: 'Lunch' }]);
  });

  it('a nameless series is listed with name null, sorted by date then series', () => {
    const m = buildMonthModel(
      inputs({
        waivers: [
          { kind: 'always_other', seriesId: 'gym' },
          { kind: 'paid_by_other', seriesId: 'rent', date: '2026-10-01' },
        ],
      }),
    );
    expect(m.paidByOther).toEqual([
      { seriesId: 'rent', name: 'Rent', date: '2026-10-01', amount: 90000, by: 'paid_by_other' },
      { seriesId: 'gym', name: null, date: '2026-10-20', amount: 4000, by: 'always_other' },
    ]);
    expect(m.alwaysOther).toEqual([{ seriesId: 'gym', name: null }]);
  });

  it('a skipped Netflix leaves still to come and is not listed (W2)', () => {
    const m = buildMonthModel(inputs({ skipped: [{ seriesId: 'netflix', date: '2026-10-03' }] }));
    expect(m.billsDue).toBe(base.billsDue - 1199);
    expect(m.moneyOut).toBe(base.moneyOut - 1199);
    expect(m.monthLeft).toBe(base.monthLeft + 1199);
    expect(m.paidByOther).toBeUndefined();
  });

  it('a recorded payment still wins over paid_by_other', () => {
    const paid = [v3Line({ id: 'r10', date: '2026-10-01', amount: 90000, seriesId: 'rent' })];
    const recorded = buildMonthModel(inputs({ lines: paid }));
    const m = buildMonthModel(inputs({ lines: paid, waivers: [{ kind: 'paid_by_other', seriesId: 'rent', date: '2026-10-01' }] }));
    expect(m.billsPaid).toBe(90000);
    expect(m).toEqual(recorded);
    expect(m.paidByOther).toBeUndefined();
  });

  it('always_other with the occurrence recorded paid: nothing dropped, but the series is still named', () => {
    const paid = [v3Line({ id: 'n10', date: '2026-10-03', amount: 1199, seriesId: 'netflix' })];
    const recorded = buildMonthModel(inputs({ lines: paid }));
    const m = buildMonthModel(inputs({ lines: paid, waivers: [{ kind: 'always_other', seriesId: 'netflix' }] }));
    expect(m.paidByOther).toBeUndefined();
    expect(m.alwaysOther).toEqual([{ seriesId: 'netflix', name: 'Netflix' }]);
    const { alwaysOther: _a, ...rest } = m;
    expect(rest).toEqual(recorded);
  });

  it('always_other for an unknown or ended series adds no entry', () => {
    const m = buildMonthModel(
      inputs({
        waivers: [
          { kind: 'always_other', seriesId: 'ghost' },
          { kind: 'always_other', seriesId: 'old' },
        ],
      }),
    );
    expect(m).toEqual(base);
    expect(m.alwaysOther).toBeUndefined();
  });

  it('readiness-only waivers change no MonthModel field', () => {
    const m = buildMonthModel(
      inputs({
        waivers: [
          { kind: 'no_pay', seriesId: 'pay', date: '2026-10-02' },
          { kind: 'income_elsewhere' },
          { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-20' },
          { kind: 'month_complete', month: '2026-09', at: '2026-10-01' },
          { kind: 'start_from', month: '2026-09' },
          { kind: 'didnt_happen', seriesId: 'rent', date: '2026-10-01' },
        ],
      }),
    );
    expect(JSON.stringify(m)).toBe(JSON.stringify(base));
  });

  it('no waivers and no skips: byte-identical on the golden people', () => {
    for (const id of ['sam']) {
      const plain = toV3Inputs(personById(id));
      const a = buildMonthModel(plain);
      const b = buildMonthModel({ ...plain, waivers: [], skipped: [] });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect('paidByOther' in a).toBe(false);
      expect('alwaysOther' in a).toBe(false);
    }
  });

  it('thisMonth without drops is unchanged and lists nothing', () => {
    const income: IncomeThisMonth = { received: mu(0), dueConfirmed: mu(0), total: mu(0), reasons: [] };
    const tmIn = { asOf: '2026-10-30', current: null, series: [rent], income, e: null, roughExpenses: null, setAside: mu(0) };
    const none = thisMonth(tmIn);
    const empty = thisMonth({ ...tmIn, drops: dueDrops({ asOf: '2026-10-30', series: [rent] }) });
    expect(none.billsDue).toBe(90000);
    expect(none.paidByOther).toEqual([]);
    expect(empty).toEqual(none);
  });
});
