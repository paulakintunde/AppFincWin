import { CLEAN_CONFIDENCE } from '../../__tests__/helpers/restsOn';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { SOLE_SHARE } from '../../../share';
import type { LimitLine, MonthModel, Purchase, V3Debt } from '../../types';
import { builtinLines, evaluateLines, validateLimits, type LineContext } from '../lines';

// 05.4-59: boundary and operand-by-operand cases for the limit lines.
const mu = (n: number): MinorUnits => minorUnits(n);

const month = (over: Partial<MonthModel> = {}): MonthModel => ({
  month: '2026-10',
  day: 3,
  daysInMonth: 31,
  moneyIn: mu(0),
  moneyOut: mu(0),
  billsPaid: mu(0),
  billsDue: mu(0),
  everydayLogged: mu(0),
  erest: mu(0),
  setAside: mu(0),
  monthLeft: mu(0),
  e: null,
  typicalIncome: mu(1_000_000),
  recurringBills: mu(0),
  typicalLeft: null,
  low: null,
  monthsUsed: [],
  categoryMonthly: [],
  housingMonthly: mu(0),
  largestLine: null,
  confidence: CLEAN_CONFIDENCE,
  notices: [],
  reasons: [],
  ...over,
});

const purchase = (over: Partial<Purchase> = {}): Purchase => ({
  whole: mu(100_000),
  dayOne: mu(0),
  monthly: mu(30_000),
  runningMonthly: mu(30_000),
  schedule: null,
  share: SOLE_SHARE,
  itemType: 'electronics',
  purpose: null,
  emergency: false,
  canUseEmergency: false,
  band: 4,
  layers: ['L0'],
  financed: true,
  secured: false,
  categoryId: null,
  envelopeId: null,
  ...over,
});

const debt = (over: Partial<V3Debt> = {}): V3Debt => ({ id: 'd1', kind: 'loan', balance: mu(0), minimum: mu(0), apr: null, secured: false, isHousing: false, ...over });
const ctx = (over: Partial<LineContext> = {}): LineContext => ({ month: month(), purchase: purchase(), debts: [], unspentAfter: null, isHousing: false, ...over });
const own = (id: string, spec: LimitLine['spec'], on = true): LimitLine => ({ id, on, source: 'own', spec });
const sched = (financed: number) => ({ financed: mu(financed) }) as unknown as Purchase['schedule'];
const unsecuredLine: LimitLine = { id: 'u', on: true, source: 'builtin', spec: { kind: 'unsecured_multiple', times: 2 } };

describe('builtinLines exact', () => {
  it('ids, sources and kinds are the documented ones', () => {
    expect(builtinLines()).toEqual([
      { id: 'builtin_housing', on: false, source: 'builtin', spec: { kind: 'housing_share', pct: percent('28') } },
      { id: 'builtin_debt', on: false, source: 'builtin', spec: { kind: 'debt_share', pct: percent('36') } },
      { id: 'builtin_unsecured', on: false, source: 'builtin', spec: { kind: 'unsecured_multiple', times: 12 } },
    ]);
  });
});

describe('validateLimits exact', () => {
  it('one invalid multiple among valid lines is still reported', () => {
    const lines = [own('a', { kind: 'single_purchase_cap', cap: mu(1) }), own('u', { kind: 'unsecured_multiple', times: 2.5 })];
    expect(validateLimits({ lines })).toEqual(['invalid_times']);
  });
});

describe('share and unsecured lines: operands one at a time', () => {
  it('a housing line already over its share adds no fact when the purchase adds nothing', () => {
    const line: LimitLine = { id: 'h', on: true, source: 'builtin', spec: { kind: 'housing_share', pct: percent('28') } };
    expect(evaluateLines({ lines: [line] }, ctx({ month: month({ housingMonthly: mu(400_000) }), isHousing: false }))).toEqual([]);
  });

  it('the typical spend of the right category is read, not the first one listed', () => {
    const m = month({
      categoryMonthly: [
        { categoryId: 'other', amount: mu(10_000) },
        { categoryId: 'food', amount: mu(40_000) },
      ],
    });
    const facts = evaluateLines({ lines: [own('b', { kind: 'category_monthly_cap', categoryId: 'food', cap: mu(50_000) })] }, ctx({ month: m, purchase: purchase({ categoryId: 'food', monthly: mu(20_000) }) }));
    expect(facts[0]!.values).toMatchObject({ unit: 'money', value: 60_000, limit: 50_000 });
  });

  it('unsecured: only unsecured debts count toward what is owed', () => {
    const debts = [debt({ id: 'a', balance: mu(100_000) }), debt({ id: 'b', balance: mu(9_000_000), secured: true })];
    const facts = evaluateLines({ lines: [{ ...unsecuredLine, spec: { kind: 'unsecured_multiple', times: 12 } }] }, ctx({ debts, purchase: purchase({ schedule: sched(12_000_000) }) }));
    expect(facts).toHaveLength(1);
    expect(facts[0]!.values).toMatchObject({ unit: 'tenths', value: 121, limit: 120 });
  });

  it('unsecured: owed plus financed equal to times x income is not over; one more unit is', () => {
    const debts = [debt({ balance: mu(1_500_000) })];
    expect(evaluateLines({ lines: [unsecuredLine] }, ctx({ debts, purchase: purchase({ schedule: sched(500_000) }) }))).toEqual([]);
    const over = evaluateLines({ lines: [unsecuredLine] }, ctx({ debts, purchase: purchase({ schedule: sched(500_001) }) }));
    expect(over[0]!.values).toMatchObject({ unit: 'tenths', value: 20, limit: 20 });
  });

  it('unsecured: no fact when the purchase adds nothing, even with debt over the multiple', () => {
    const debts = [debt({ balance: mu(9_000_000) })];
    expect(evaluateLines({ lines: [unsecuredLine] }, ctx({ debts, purchase: purchase({ financed: false, schedule: sched(500_000) }) }))).toEqual([]);
  });

  it('unsecured: zero income gives no fact and does not divide by zero', () => {
    const debts = [debt({ balance: mu(9_000_000) })];
    const c = ctx({ month: month({ typicalIncome: mu(0) }), debts, purchase: purchase({ schedule: sched(500_000) }) });
    expect(evaluateLines({ lines: [unsecuredLine] }, c)).toEqual([]);
  });
});

describe('fact order', () => {
  it('sorts three shuffled ids ascending', () => {
    const lines = ['c', 'a', 'b'].map((id) => own(id, { kind: 'single_purchase_cap', cap: mu(1) }));
    expect(evaluateLines({ lines }, ctx()).map((f) => f.values.lineId)).toEqual(['a', 'b', 'c']);
    const back = ['a', 'b', 'c'].map((id) => own(id, { kind: 'single_purchase_cap', cap: mu(1) }));
    expect(evaluateLines({ lines: back }, ctx()).map((f) => f.values.lineId)).toEqual(['a', 'b', 'c']);
  });
  it('lines with the same id keep their given order', () => {
    const lines = [own('x', { kind: 'single_purchase_cap', cap: mu(1) }), own('x', { kind: 'single_purchase_cap', cap: mu(2) })];
    expect(evaluateLines({ lines }, ctx()).map((f) => f.values.limit)).toEqual([1, 2]);
  });
});
