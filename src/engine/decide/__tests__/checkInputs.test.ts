import { minorUnits } from '../../money/types';
import { ONE_HUNDRED_PERCENT, percent, percentFromScaled, type Percent } from '../../payoff';
import { lossOfValueMonthly, netRunningCosts, resolvePriceInputs, salesTaxAmount } from '../checkInputs';
import type { CostLine, PriceAdjustment } from '../types';

const m = minorUnits;

function adj(id: string, amount: number, over: Partial<PriceAdjustment> = {}): PriceAdjustment {
  return { id, amount: m(amount), effect: 'adds', onDay: true, counted: true, ...over };
}

function cost(id: string, amount: number, over: Partial<CostLine> = {}): CostLine {
  return { id, amount: m(amount), counted: true, ...over };
}

describe('salesTaxAmount', () => {
  it('rounds half-up once', () => {
    expect(salesTaxAmount(m(1_450_000), percent('8.875'))).toBe(128_688);
    expect(salesTaxAmount(m(1_450_000), percent('6'))).toBe(87_000);
  });

  it('is zero for a zero rate or a zero price', () => {
    expect(salesTaxAmount(m(1_450_000), percent('0'))).toBe(0);
    expect(salesTaxAmount(m(0), percent('8.875'))).toBe(0);
  });

  it('rejects a negative price, a fractional price and a negative rate', () => {
    expect(() => salesTaxAmount(m(-1), percent('6'))).toThrow(/^salesTaxAmount: /);
    expect(() => salesTaxAmount(1.5 as never, percent('6'))).toThrow(/^salesTaxAmount: /);
    expect(() => salesTaxAmount(m(1), -1n as Percent)).toThrow(/^salesTaxAmount: /);
  });
});

describe('resolvePriceInputs', () => {
  it('counts adds and takes-off, and only on-the-day adds enter dayFees', () => {
    const r = resolvePriceInputs({
      advertised: m(1_450_000),
      adjustments: [
        adj('doc', 45_000),
        adj('trade', 200_000, { effect: 'takes_off' }),
        adj('warranty', 90_000, { onDay: false }),
        adj('mats', 10_000, { counted: false }),
      ],
    });
    expect(r).toEqual({
      advertised: 1_450_000,
      adjustmentsNet: -65_000,
      price: 1_385_000,
      dayFees: 45_000,
      countedLines: 3,
      totalLines: 4,
    });
  });

  it('maps the quick check tax and fees (05 D-23)', () => {
    const r = resolvePriceInputs({
      advertised: m(1_450_000),
      adjustments: [adj('tax', salesTaxAmount(m(1_450_000), percent('6'))), adj('fees', 8_000)],
    });
    expect(r.price).toBe(1_545_000);
    expect(r.dayFees).toBe(95_000);
  });

  it('floors the price at zero when a trade-in exceeds it', () => {
    const r = resolvePriceInputs({ advertised: m(100_000), adjustments: [adj('t', 150_000, { effect: 'takes_off' })] });
    expect(r.price).toBe(0);
    expect(r.adjustmentsNet).toBe(-150_000);
  });

  it('with no adjustments the price is the advertised price', () => {
    expect(resolvePriceInputs({ advertised: m(500), adjustments: [] })).toEqual({
      advertised: 500,
      adjustmentsNet: 0,
      price: 500,
      dayFees: 0,
      countedLines: 0,
      totalLines: 0,
    });
  });

  it('rejects bad amounts and duplicate ids', () => {
    expect(() => resolvePriceInputs({ advertised: m(-1), adjustments: [] })).toThrow(/^resolvePriceInputs: /);
    expect(() => resolvePriceInputs({ advertised: m(1), adjustments: [adj('a', -1)] })).toThrow(
      /^resolvePriceInputs: /
    );
    expect(() => resolvePriceInputs({ advertised: m(1), adjustments: [adj('a', 1), adj('a', 2)] })).toThrow(
      /^resolvePriceInputs: duplicate/
    );
  });
});

describe('netRunningCosts', () => {
  const costs = [cost('ins', 12_000), cost('park', 8_000), cost('fuel', 15_000, { counted: false })];
  const bus = [cost('bus', 9_000)];

  it('nets counted costs against counted replaced expenses', () => {
    expect(netRunningCosts(costs, bus)).toEqual({
      gross: 20_000,
      replaced: 9_000,
      net: 11_000,
      countedCosts: 2,
      totalCosts: 3,
      countedReplaced: 1,
      nonCash: 0,
    });
  });

  it('is negative when only replaced expenses are counted', () => {
    expect(netRunningCosts([], [cost('x', 5_000)]).net).toBe(-5_000);
  });

  it('ignores uncounted replaced lines', () => {
    expect(netRunningCosts([], [cost('x', 5_000, { counted: false })])).toMatchObject({
      replaced: 0,
      countedReplaced: 0,
    });
  });

  it('D-55: a counted loss_of_value line is non-cash and leaves gross and net unchanged', () => {
    const r = netRunningCosts([...costs, cost('lov', 25_000, { category: 'loss_of_value' })], bus);
    expect(r).toMatchObject({ gross: 20_000, net: 11_000, nonCash: 25_000, countedCosts: 2, totalCosts: 4 });
  });

  it('D-55: an uncounted loss_of_value line adds nothing', () => {
    const r = netRunningCosts([cost('lov', 25_000, { category: 'loss_of_value', counted: false })], []);
    expect(r.nonCash).toBe(0);
  });

  it('a cash category still counts as cash', () => {
    expect(netRunningCosts([cost('i', 1_000, { category: 'insurance' })], []).gross).toBe(1_000);
  });

  it('rejects a non-cash replaced line and bad amounts', () => {
    expect(() => netRunningCosts([], [cost('lov', 1, { category: 'loss_of_value' })])).toThrow(/^netRunningCosts: /);
    expect(() => netRunningCosts([{ ...cost('a', 1), amount: -1 as never }], [])).toThrow(/^netRunningCosts: /);
    expect(() => netRunningCosts([], [{ ...cost('a', 1), amount: 1.5 as never }])).toThrow(/^netRunningCosts: /);
  });
});

describe('lossOfValueMonthly (D-63)', () => {
  const pctYear = (p: string) => ({ kind: 'percent_per_year' as const, percentPerYear: percent(p) });

  it('converts a yearly percent of the advertised price to a monthly amount, rounded half-up once', () => {
    expect(lossOfValueMonthly(pctYear('15'), m(1_450_000))).toBe(18_125);
    expect(lossOfValueMonthly(pctYear('10'), m(1_450_000))).toBe(12_083);
    expect(lossOfValueMonthly(pctYear('1'), m(1_800))).toBe(2);
    expect(lossOfValueMonthly(pctYear('100'), m(1_200_000))).toBe(100_000);
    expect(lossOfValueMonthly(pctYear('0'), m(1_450_000))).toBe(0);
    expect(lossOfValueMonthly(pctYear('15'), m(0))).toBe(0);
  });

  it('takes an amount as typed whatever the price', () => {
    expect(lossOfValueMonthly({ kind: 'amount', monthly: m(25_000) }, m(1))).toBe(25_000);
  });

  it('rejects a rate outside 0..100%, a bad amount and a bad price', () => {
    const over = percentFromScaled(ONE_HUNDRED_PERCENT + 1n);
    expect(() => lossOfValueMonthly({ kind: 'percent_per_year', percentPerYear: over }, m(1))).toThrow(
      /^lossOfValueMonthly: /
    );
    expect(() => lossOfValueMonthly({ kind: 'percent_per_year', percentPerYear: -1n as Percent }, m(1))).toThrow(
      /^lossOfValueMonthly: /
    );
    expect(() => lossOfValueMonthly({ kind: 'amount', monthly: m(-1) }, m(1))).toThrow(/^lossOfValueMonthly: /);
    expect(() => lossOfValueMonthly({ kind: 'amount', monthly: 1.5 as never }, m(1))).toThrow(/^lossOfValueMonthly: /);
    expect(() => lossOfValueMonthly(pctYear('1'), m(-1))).toThrow(/^lossOfValueMonthly: /);
    expect(() => lossOfValueMonthly(pctYear('1'), 1.5 as never)).toThrow(/^lossOfValueMonthly: /);
  });

  it('throws on an unknown input kind', () => {
    expect(() => lossOfValueMonthly({ kind: 'nope' } as never, m(1))).toThrow(/Unhandled loss of value input/);
  });

  it('end to end: the figure reaches nonCash only', () => {
    const lov = lossOfValueMonthly(pctYear('15'), m(1_450_000));
    const r = netRunningCosts(
      [
        cost('ins', 12_000),
        cost('park', 8_000),
        cost('fuel', 15_000, { counted: false }),
        cost('lov', lov, { category: 'loss_of_value' }),
      ],
      [cost('bus', 9_000)]
    );
    expect(r.net).toBe(11_000);
    expect(r.nonCash).toBe(18_125);
  });
});
