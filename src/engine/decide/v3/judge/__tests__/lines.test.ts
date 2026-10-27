import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { SOLE_SHARE } from '../../../share';
import type { LimitLine, MonthModel, Purchase, V3Debt } from '../../types';
import { builtinLines, evaluateLines, validateLimits, type LineContext } from '../lines';

const mu = (n: number): MinorUnits => minorUnits(n);

function month(over: Partial<MonthModel> = {}): MonthModel {
  return {
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
    typicalIncome: mu(500_000),
    recurringBills: mu(0),
    typicalLeft: null,
    low: null,
    monthsUsed: [],
    categoryMonthly: [],
    housingMonthly: mu(0),
    largestLine: null,
    confidence: { level: 'fair', reasons: [] },
    notices: [],
    reasons: [],
    ...over,
  };
}

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
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
  };
}

function debt(over: Partial<V3Debt> = {}): V3Debt {
  return { id: 'd1', kind: 'loan', balance: mu(0), minimum: mu(175_000), apr: null, secured: false, isHousing: false, ...over };
}

function ctx(over: Partial<LineContext> = {}): LineContext {
  return { month: month(), purchase: purchase(), debts: [debt()], unspentAfter: null, isHousing: false, ...over };
}

const debtLine = (on: boolean): LimitLine => ({ id: 'a', on, source: 'builtin', spec: { kind: 'debt_share', pct: percent('36') } });
const own = (id: string, spec: LimitLine['spec'], on = true): LimitLine => ({ id, on, source: 'own', spec });

describe('lines', () => {
  it('D-11 builtins off by default', () => {
    const b = builtinLines();
    expect(b).toHaveLength(3);
    expect(b.every((l) => !l.on)).toBe(true);
    expect(b.map((l) => l.spec)).toEqual([
      { kind: 'housing_share', pct: percent('28') },
      { kind: 'debt_share', pct: percent('36') },
      { kind: 'unsecured_multiple', times: 12 },
    ]);
  });

  it('D-10 example', () => {
    expect(evaluateLines({ lines: [debtLine(true)] }, ctx())).toEqual([
      { code: 'line_crossed', values: { lineId: 'a', kind: 'debt_share', unit: 'percent', value: 41, limit: '36' } },
    ]);
  });

  it('D-10 off lines are silent', () => {
    expect(evaluateLines({ lines: [debtLine(false)] }, ctx())).toEqual([]);
  });

  it('a line not crossed adds nothing', () => {
    expect(evaluateLines({ lines: [debtLine(true)] }, ctx({ debts: [debt({ minimum: mu(100_000) })] }))).toEqual([]);
  });

  it('D-12 four own kinds, each only when crossed', () => {
    const c = ctx({
      month: month({ categoryMonthly: [{ categoryId: 'food', amount: mu(40_000) }] }),
      purchase: purchase({ categoryId: 'food', whole: mu(90_000), monthly: mu(20_000) }),
      unspentAfter: mu(5_000),
    });
    const lines = [
      own('b', { kind: 'category_monthly_cap', categoryId: 'food', cap: mu(50_000) }),
      own('c', { kind: 'single_purchase_cap', cap: mu(80_000) }),
      own('d', { kind: 'category_income_share', categoryId: 'food', pct: percent('10') }),
      own('e', { kind: 'unspent_floor', floor: mu(10_000) }),
    ];
    const facts = evaluateLines({ lines }, c);
    expect(facts.map((f) => f.values.lineId)).toEqual(['b', 'c', 'd', 'e']);
    expect(facts[0]!.values).toMatchObject({ unit: 'money', value: 60_000, limit: 50_000 });
    expect(facts[2]!.values).toMatchObject({ unit: 'percent', value: 12, limit: '10' });
    expect(facts[3]!.values).toMatchObject({ unit: 'money', value: 5_000, limit: 10_000 });
    const none = [
      own('b', { kind: 'category_monthly_cap', categoryId: 'food', cap: mu(60_000) }),
      own('c', { kind: 'single_purchase_cap', cap: mu(90_000) }),
      own('d', { kind: 'category_income_share', categoryId: 'food', pct: percent('12') }),
      own('e', { kind: 'unspent_floor', floor: mu(5_000) }),
      own('f', { kind: 'category_monthly_cap', categoryId: 'other', cap: mu(1) }),
    ];
    expect(evaluateLines({ lines: none }, c)).toEqual([]);
    expect(evaluateLines({ lines: [own('e', { kind: 'unspent_floor', floor: mu(1) })] }, ctx({ unspentAfter: null }))).toEqual([]);
  });

  it('category lines for another category, an unlisted category and duplicate ids', () => {
    const c = ctx({ purchase: purchase({ categoryId: 'food', monthly: mu(30_000) }) });
    expect(evaluateLines({ lines: [own('d', { kind: 'category_income_share', categoryId: 'other', pct: percent('1') })] }, c)).toEqual([]);
    // food is not in categoryMonthly: its typical spend counts as zero
    const facts = evaluateLines({ lines: [own('d', { kind: 'category_income_share', categoryId: 'food', pct: percent('1') })] }, c);
    expect(facts[0]!.values).toMatchObject({ value: 6, limit: '1' });
    const same = evaluateLines({ lines: [own('x', { kind: 'single_purchase_cap', cap: mu(1) }), own('x', { kind: 'single_purchase_cap', cap: mu(2) })] }, c);
    expect(same).toHaveLength(2);
  });

  it('housing_share counts M only when the purchase is housing', () => {
    const line: LimitLine = { id: 'h', on: true, source: 'builtin', spec: { kind: 'housing_share', pct: percent('28') } };
    const m = month({ housingMonthly: mu(120_000) });
    expect(evaluateLines({ lines: [line] }, ctx({ month: m, isHousing: false }))).toEqual([]);
    expect(evaluateLines({ lines: [line] }, ctx({ month: m, isHousing: true }))[0]!.values).toMatchObject({ value: 30, limit: '28' });
  });

  it('unsecured_multiple counts the financed amount only when unsecured', () => {
    const line: LimitLine = { id: 'u', on: true, source: 'builtin', spec: { kind: 'unsecured_multiple', times: 12 } };
    const schedule = { financed: mu(6_100_000) } as unknown as Purchase['schedule'];
    const debts = [debt({ balance: mu(100_000), minimum: mu(0) })];
    const hit = evaluateLines({ lines: [line] }, ctx({ debts, purchase: purchase({ schedule }) }));
    expect(hit[0]!.values).toMatchObject({ unit: 'tenths', value: 124, limit: 120 });
    expect(evaluateLines({ lines: [line] }, ctx({ debts, purchase: purchase({ schedule, secured: true }) }))).toEqual([]);
  });

  it('a cash purchase adds nothing to the debt share and facts sort by line id', () => {
    expect(evaluateLines({ lines: [debtLine(true)] }, ctx({ purchase: purchase({ financed: false }) }))).toEqual([]);
    const c = ctx();
    const facts = evaluateLines(
      { lines: [own('z', { kind: 'single_purchase_cap', cap: mu(1) }), own('m', { kind: 'single_purchase_cap', cap: mu(1) })] },
      c,
    );
    expect(facts.map((f) => f.values.lineId)).toEqual(['m', 'z']);
  });

  it('L-07 the multiple is integer tenths, never a float', () => {
    const line: LimitLine = { id: 'u', on: true, source: 'builtin', spec: { kind: 'unsecured_multiple', times: 12 } };
    const schedule = { financed: mu(6_100_000) } as unknown as Purchase['schedule'];
    const hit = evaluateLines({ lines: [line] }, ctx({ debts: [debt({ balance: mu(100_000), minimum: mu(0) })], purchase: purchase({ schedule }) }));
    expect(Number.isInteger(hit[0]!.values.value)).toBe(true);
  });

  it('M-05 a fractional or negative multiple is reported and yields no fact, without throwing', () => {
    const schedule = { financed: mu(6_100_000) } as unknown as Purchase['schedule'];
    const c = ctx({ debts: [debt({ balance: mu(100_000), minimum: mu(0) })], purchase: purchase({ schedule }) });
    for (const times of [2.5, -1, Number.NaN, Number.MAX_VALUE]) {
      const limits = { lines: [own('u', { kind: 'unsecured_multiple', times })] };
      expect(validateLimits(limits)).toContain('invalid_times');
      expect(() => evaluateLines(limits, c)).not.toThrow();
      expect(evaluateLines(limits, c)).toEqual([]);
    }
    expect(validateLimits({ lines: [own('u', { kind: 'unsecured_multiple', times: 0 })] })).not.toContain('invalid_times');
  });

  it('zero income gives no percentage fact', () => {
    expect(evaluateLines({ lines: [debtLine(true)] }, ctx({ month: month({ typicalIncome: mu(0) }) }))).toEqual([]);
  });

  it('D-12 validateLimits', () => {
    const mk = (n: number, source: 'builtin' | 'own', p: string): LimitLine[] =>
      Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, on: true, source, spec: { kind: 'single_purchase_cap' as const, cap: mu(1) } }));
    expect(validateLimits({ lines: [...mk(3, 'builtin', 'b'), ...mk(5, 'own', 'o')] })).toEqual([]);
    expect(validateLimits({ lines: mk(4, 'builtin', 'b') })).toEqual(['too_many_builtin']);
    expect(validateLimits({ lines: mk(6, 'own', 'o') })).toEqual(['too_many_own']);
    expect(validateLimits({ lines: [...mk(1, 'own', 'o'), ...mk(1, 'own', 'o')] })).toEqual(['duplicate_id']);
  });
});
