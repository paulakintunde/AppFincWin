import { currencyCode, minorUnits } from '../../money/types';
import { deriveMoney, resolveSpendingShare, shareForCategory, summariseMonth, type SummariseOptions } from '../money';
import { SOLE_SHARE, type ShareScope } from '../share';
import type { MonthRecord, RecordLine, SpendingShare } from '../types';
import { USD, bill, fullMonth, income, line, monthsOf } from './helpers/fixtures';

const m = minorUnits;
const PERSONAL: SpendingShare = { byDefault: SOLE_SHARE, byCategory: [] };
const hh: ShareScope = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } };

function share(scope: ShareScope, rules: Parameters<typeof resolveSpendingShare>[1]): SpendingShare {
  const r = resolveSpendingShare(scope, rules);
  if (!r.ok) throw new Error('expected ok');
  return r.share;
}

const EVEN2 = share(hh, { rule: { kind: 'even' }, byCategory: [] });
const EVEN2_RENT = share(hh, {
  rule: { kind: 'even' },
  byCategory: [{ categoryId: 'cat_rent', rule: { kind: 'weight', weights: [3, 1] } }],
});

function opts(over: Partial<SummariseOptions> = {}): SummariseOptions {
  return {
    currency: USD,
    smoothedSeriesIds: new Set(),
    spendingShare: PERSONAL,
    smoothedBillsMonthly: m(0),
    smoothedPay: new Map(),
    ...over,
  };
}

function month(lines: RecordLine[], key = '2026-05'): MonthRecord {
  return { month: key, full: true, lines };
}

const d = (day: number) => `2026-05-${String(day).padStart(2, '0')}`;
let seq = 0;
const out = (amount: number, over: Partial<RecordLine> = {}) =>
  line({ id: `o${seq++}`, date: d(10), direction: 'out', amount, ...over });
const inn = (amount: number, over: Partial<RecordLine> = {}) =>
  line({ id: `i${seq++}`, date: d(10), direction: 'in', amount, ...over });

describe('resolveSpendingShare', () => {
  it('personal scope is the sole share and ignores householdSpending', () => {
    const r = resolveSpendingShare({ kind: 'personal' }, { rule: { kind: 'even' }, byCategory: [] });
    expect(r).toEqual({ ok: true, share: { byDefault: SOLE_SHARE, byCategory: [] } });
  });

  it('household uses the household rule, not the purchase rule', () => {
    const s = share(hh, { rule: { kind: 'even' }, byCategory: [] });
    expect(s.byDefault.weights).toEqual([1, 1]);
  });

  it('carries per-category rules', () => {
    expect(EVEN2_RENT.byCategory).toHaveLength(1);
    expect(EVEN2_RENT.byCategory[0]!.share.weights).toEqual([3, 1]);
  });

  it('reports zero weights and zero amounts', () => {
    expect(resolveSpendingShare(hh, { rule: { kind: 'weight', weights: [0, 0] }, byCategory: [] })).toEqual({
      ok: false,
      reason: 'split_weights_zero',
    });
    expect(
      resolveSpendingShare(hh, {
        rule: { kind: 'even' },
        byCategory: [{ categoryId: 'c', rule: { kind: 'amount', amounts: [m(0), m(0)] } }],
      })
    ).toEqual({ ok: false, reason: 'split_amounts_zero' });
  });

  it('guards', () => {
    expect(() => resolveSpendingShare(hh, null)).toThrow(/^RangeError: resolveSpendingShare: |resolveSpendingShare: /);
    expect(() =>
      resolveSpendingShare(hh, {
        rule: { kind: 'even' },
        byCategory: [
          { categoryId: 'c', rule: { kind: 'even' } },
          { categoryId: 'c', rule: { kind: 'mine' } },
        ],
      })
    ).toThrow(/^resolveSpendingShare: /);
    expect(() => resolveSpendingShare({ kind: 'x' } as never, null)).toThrow(/Unhandled/);
  });
});

describe('shareForCategory', () => {
  it('uses the listed category or the default', () => {
    expect(shareForCategory(EVEN2_RENT, 'cat_rent').weights).toEqual([3, 1]);
    expect(shareForCategory(EVEN2_RENT, 'cat_food').weights).toEqual([1, 1]);
    expect(shareForCategory(EVEN2_RENT, null).weights).toEqual([1, 1]);
  });
});

describe('summariseMonth', () => {
  const zero = { count: 0, spending: 0, income: 0 };

  it('counts only paid lines', () => {
    const r = summariseMonth(
      month([
        inn(600_000),
        out(200_000),
        out(50_000, { status: 'pending' }),
        out(30_000, { status: 'skipped' }),
        inn(999, { status: 'pending' }),
      ]),
      opts()
    );
    expect(r).toEqual({ month: '2026-05', income: 600_000, spending: 200_000, oneOffs: zero });
  });

  it('ignores both transfer legs', () => {
    const r = summariseMonth(month([out(100_000, { transferId: 't1' }), inn(100_000, { transferId: 't1' })]), opts());
    expect(r.income).toBe(0);
    expect(r.spending).toBe(0);
  });

  it('nets a refund against spending and never counts it as income', () => {
    const r = summariseMonth(month([out(200_000), inn(20_000, { isRefund: true })]), opts());
    expect(r.spending).toBe(180_000);
    expect(r.income).toBe(0);
  });

  it('floors a month at 0 when the refund is larger', () => {
    const r = summariseMonth(month([out(10_000), inn(25_000, { isRefund: true }), inn(5_000)]), opts());
    expect(r.spending).toBe(0);
    expect(r.income).toBe(5_000);
  });

  it('a refund with no spending in its category yields zero spending', () => {
    expect(
      summariseMonth(month([inn(25_000, { isRefund: true, categoryId: 'cat_food' })]), opts({ spendingShare: EVEN2 }))
        .spending
    ).toBe(0);
  });

  it('replaces smoothed series lines with the monthly equivalent, including a refund of them', () => {
    const o = opts({ smoothedSeriesIds: new Set(['s1']), smoothedBillsMonthly: m(10_000) });
    expect(summariseMonth(month([out(120_000, { seriesId: 's1' }), out(200_000)]), o).spending).toBe(210_000);
    expect(
      summariseMonth(month([out(120_000, { seriesId: 's1' }), inn(5_000, { seriesId: 's1', isRefund: true })]), o)
        .spending
    ).toBe(10_000);
  });

  it('counts a line of a non-smoothed series as ordinary spending', () => {
    const o = opts({ smoothedSeriesIds: new Set(['s1']) });
    expect(summariseMonth(month([out(70_000, { seriesId: 'm1' })]), o).spending).toBe(70_000);
  });

  it('floors the net before adding the smoothed bills', () => {
    const o = opts({ smoothedBillsMonthly: m(10_000) });
    expect(summariseMonth(month([out(10_000), inn(25_000, { isRefund: true })]), o).spending).toBe(10_000);
  });

  it('shares household spending by category and keeps income whole', () => {
    const r = summariseMonth(
      month([out(200_000, { categoryId: 'cat_rent' }), out(100_000, { categoryId: 'cat_food' }), inn(600_000)]),
      opts({ spendingShare: EVEN2_RENT })
    );
    expect(r.income).toBe(600_000);
    expect(r.spending).toBe(150_000 + 50_000);
  });

  it('nets a refund inside its own category before sharing', () => {
    const r = summariseMonth(
      month([out(100_000, { categoryId: 'cat_food' }), inn(40_000, { categoryId: 'cat_food', isRefund: true })]),
      opts({ spendingShare: EVEN2 })
    );
    expect(r.spending).toBe(30_000);
  });

  it('rejects malformed lines', () => {
    expect(() => summariseMonth(month([out(1, { date: '2026-06-01' })]), opts())).toThrow(/^summariseMonth: /);
    expect(() => summariseMonth(month([out(1, { date: '2026-05-32' })]), opts())).toThrow(/^summariseMonth: /);
    expect(() => summariseMonth(month([out(-1)]), opts())).toThrow(/^summariseMonth: /);
    expect(() => summariseMonth(month([{ ...out(1), amount: 1.5 as never }]), opts())).toThrow(/^summariseMonth: /);
    expect(() => summariseMonth(month([{ ...out(1), isRefund: true }]), opts())).toThrow(/^summariseMonth: /);
    expect(() => summariseMonth(month([out(1, { currency: currencyCode('CAD') })]), opts())).toThrow(
      /^summariseMonth: mixed currencies/
    );
  });

  describe('pay smoothing inputs (summariseMonth side)', () => {
    const pay = opts({ smoothedPay: new Map([['pay', m(433_333)]]) });
    const payLine = (day: number, over: Partial<RecordLine> = {}) =>
      inn(200_000, { date: d(day), seriesId: 'pay', ...over });

    it('replaces the pay lines with the monthly equivalent', () => {
      expect(summariseMonth(month([payLine(8), payLine(22), inn(50_000)]), pay).income).toBe(483_333);
    });
    it('an extra payday is not extra income', () => {
      expect(summariseMonth(month([payLine(1), payLine(15), payLine(29)]), pay).income).toBe(433_333);
    });
    it('adds nothing when the month has no pay line or only a pending one', () => {
      expect(summariseMonth(month([inn(50_000)]), pay).income).toBe(50_000);
      expect(summariseMonth(month([payLine(8, { status: 'pending' })]), pay).income).toBe(0);
    });
    it('a one-off pay line is replaced and not counted as a one-off', () => {
      const r = summariseMonth(month([payLine(8, { oneOff: true })]), pay);
      expect(r.income).toBe(433_333);
      expect(r.oneOffs.count).toBe(0);
    });
    it('an income line of a series outside smoothedPay counts as logged', () => {
      expect(summariseMonth(month([inn(70_000, { seriesId: 'side' })]), pay).income).toBe(70_000);
    });
    it('a refund carrying the pay series id still nets against spending', () => {
      const r = summariseMonth(month([out(100_000), payLine(8, { isRefund: true, amount: m(30_000) })]), pay);
      expect(r.spending).toBe(70_000);
      expect(r.income).toBe(0);
    });
    it('never touches spending', () => {
      expect(summariseMonth(month([out(40_000, { seriesId: 'pay' })]), pay).spending).toBe(40_000);
    });
  });

  describe('one-off lines (summariseMonth side)', () => {
    it('leaves a one-off out of spending and counts it', () => {
      const r = summariseMonth(month([out(500_000, { oneOff: true }), out(200_000), inn(600_000)]), opts());
      expect(r).toEqual({
        month: '2026-05',
        income: 600_000,
        spending: 200_000,
        oneOffs: { count: 1, spending: 500_000, income: 0 },
      });
    });
    it('leaves a one-off bonus out of income', () => {
      const r = summariseMonth(month([inn(100_000, { oneOff: true }), inn(600_000)]), opts());
      expect(r.income).toBe(600_000);
      expect(r.oneOffs).toEqual({ count: 1, spending: 0, income: 100_000 });
    });
    it('a one-off refund is left out of the netting and only counted', () => {
      const r = summariseMonth(month([out(100_000), inn(40_000, { isRefund: true, oneOff: true })]), opts());
      expect(r.spending).toBe(100_000);
      expect(r.oneOffs).toEqual({ count: 1, spending: 0, income: 0 });
    });
    it('ignores one-off pending, transfer and smoothed-series lines', () => {
      const o = opts({ smoothedSeriesIds: new Set(['s1']) });
      const r = summariseMonth(
        month([
          out(1_000, { oneOff: true, status: 'pending' }),
          out(2_000, { oneOff: true, transferId: 't' }),
          out(3_000, { oneOff: true, seriesId: 's1' }),
        ]),
        o
      );
      expect(r.oneOffs.count).toBe(0);
      expect(r.spending).toBe(0);
    });
    it('counts my share of a household one-off', () => {
      const r = summariseMonth(month([out(300_000, { oneOff: true })]), opts({ spendingShare: EVEN2 }));
      expect(r.oneOffs.spending).toBe(150_000);
    });
  });
});

describe('deriveMoney', () => {
  const run = (over: Partial<Parameters<typeof deriveMoney>[0]> = {}) =>
    deriveMoney({
      currency: USD,
      months: [],
      bills: [],
      incomeSeries: [],
      basisOverride: null,
      spendingShare: PERSONAL,
      ...over,
    });
  const ok = (over: Partial<Parameters<typeof deriveMoney>[0]> = {}) => {
    const r = run(over);
    if (!r.ok) throw new Error('expected ok');
    return r.money;
  };
  const incomes = (vals: number[]) => monthsOf(vals.map((v) => [v, 0] as const));

  it('needs one full month', () => {
    expect(run()).toEqual({ ok: false, reason: 'no_full_month' });
    expect(run({ months: [{ ...fullMonth('2026-01', 1, 1), full: false }] })).toEqual({
      ok: false,
      reason: 'no_full_month',
    });
  });

  it('ignores partial months', () => {
    const money = ok({
      months: [
        ...monthsOf([
          [500_000, 0],
          [500_000, 0],
          [500_000, 0],
        ]),
        { ...fullMonth('2026-04', 9_000_000, 0), full: false },
      ],
    });
    expect(money.incomeAverage).toBe(500_000);
    expect(money.fullMonthsUsed).toBe(3);
  });

  it('keeps the last 6 full months whatever the input order', () => {
    const ms = monthsOf(Array.from({ length: 8 }, (_, i) => [100 + i, 0] as const));
    const shuffled = [ms[3]!, ms[7]!, ms[0]!, ms[5]!, ms[1]!, ms[6]!, ms[2]!, ms[4]!];
    const money = ok({ months: shuffled });
    expect(money.fullMonthsUsed).toBe(6);
    expect(money.monthsUsed[0]!.month).toBe('2026-08');
    expect(money.monthsUsed[5]!.month).toBe('2026-03');
  });

  it('rounds averages half-up', () => {
    expect(ok({ months: incomes([100, 101]) }).incomeAverage).toBe(101);
    expect(
      ok({
        months: monthsOf([
          [0, 10],
          [0, 11],
          [0, 11],
        ]),
      }).spendingAverage
    ).toBe(11);
  });

  it('worst income is the minimum, best the maximum, worst spending the maximum', () => {
    const money = ok({
      months: monthsOf([
        [500_000, 300_000],
        [450_000, 350_000],
        [520_000, 320_000],
      ]),
    });
    expect(money.incomeWorst).toBe(450_000);
    expect(money.incomeBest).toBe(520_000);
    expect(money.spendingWorst).toBe(350_000);
  });

  it.each([
    [[9_401, 9_401, 10_599, 10_599], 'steady'],
    [[9_400, 9_400, 10_600, 10_600], 'variable'],
    [[7_801, 7_801, 12_199, 12_199], 'variable'],
    [[7_800, 7_800, 12_200, 12_200], 'volatile'],
  ] as const)('classifies %j as %s at the exact boundary', (vals, expected) => {
    expect(ok({ months: incomes([...vals]) }).steadiness).toBe(expected);
  });

  it('is insufficient under 3 full months and defaults to the cautious basis on both sides', () => {
    expect(ok({ months: incomes([500_000]) }).steadiness).toBe('insufficient');
    const two = ok({
      months: monthsOf([
        [500_000, 300_000],
        [450_000, 350_000],
      ]),
    });
    expect(two.steadiness).toBe('insufficient');
    expect(two.incomeCvPercent).toBeNull();
    expect(two.basis).toBe('worst');
    expect(two.incomeBasis).toBe(450_000);
    expect(two.spendingBasis).toBe(350_000);
    const three = ok({
      months: monthsOf([
        [500_000, 300_000],
        [500_000, 300_000],
        [500_000, 300_000],
      ]),
    });
    expect(three.steadiness).toBe('steady');
    expect(three.basis).toBe('average');
  });

  it('treats all-zero income as volatile with no CV (04-REVIEW LO-01; the prototype said steady)', () => {
    const money = ok({ months: incomes([0, 0, 0]) });
    expect(money.steadiness).toBe('volatile');
    expect(money.incomeCvPercent).toBeNull();
    expect(money.basis).toBe('worst');
  });

  it.each([
    [[9_400, 9_400, 10_600, 10_600], 6],
    [[9_401, 9_401, 10_599, 10_599], 6],
    [[7_800, 7_800, 12_200, 12_200], 22],
    [[5_000, 10_000, 15_000], 41],
    [[700, 700, 700], 0],
  ] as const)('incomeCvPercent for %j is %d', (vals, pct) => {
    expect(ok({ months: incomes([...vals]) }).incomeCvPercent).toBe(pct);
  });

  it('lets an explicit basis override win', () => {
    const volatile = incomes([7_800, 7_800, 12_200, 12_200]);
    const avg = ok({ months: volatile, basisOverride: 'average' });
    expect(avg.basis).toBe('average');
    expect(avg.incomeBasis).toBe(avg.incomeAverage);
    expect(avg.spendingBasis).toBe(avg.spendingAverage);
    const steady = monthsOf([
      [500, 300],
      [500, 350],
      [500, 300],
    ]);
    const worst = ok({ months: steady, basisOverride: 'worst' });
    expect(worst.incomeBasis).toBe(worst.incomeWorst);
    expect(worst.spendingBasis).toBe(350);
  });

  describe('confirmed bills (smoothing mechanics)', () => {
    const base = () =>
      monthsOf([
        [600_000, 300_000],
        [600_000, 300_000],
        [600_000, 300_000],
      ]);
    const yearly = bill({ seriesId: 's-ins', freq: 'yearly', anchorDate: '2026-02-15', latestAmount: 120_000 });
    const withLine = () => {
      const ms = base();
      ms[1] = fullMonth('2026-02', 600_000, 300_000, [
        line({ id: 'ins', date: '2026-02-15', direction: 'out', amount: 120_000, seriesId: 's-ins' }),
      ]);
      return ms;
    };

    it('removes the occurrence and adds the monthly equivalent to every month', () => {
      const money = ok({ months: withLine(), bills: [yearly] });
      expect(money.spendingAverage).toBe(310_000);
      expect(money.spendingWorst).toBe(310_000);
      expect(money.smoothedBillsMonthly).toBe(10_000);
    });
    it.each([
      ['weekly', 4_333],
      ['fortnightly', 2_167],
      ['quarterly', 333],
    ] as const)('converts %s 1_000 to %d', (freq, expected) => {
      const b = bill({ seriesId: 'b', freq, anchorDate: '2026-01-02', latestAmount: 1_000 });
      expect(ok({ months: base(), bills: [b] }).smoothedBillsMonthly).toBe(expected);
    });
    it('adds nothing for a confirmed monthly bill and keeps its lines', () => {
      const mb = bill({ seriesId: 'b', freq: 'monthly', anchorDate: '2026-01-02', latestAmount: 5_000 });
      const ms = [
        fullMonth('2026-01', 1, 300_000, [
          line({ id: 'x', date: '2026-01-02', direction: 'out', amount: 5_000, seriesId: 'b' }),
        ]),
      ];
      const money = ok({ months: ms, bills: [mb] });
      expect(money.smoothedBillsMonthly).toBe(0);
      expect(money.spendingAverage).toBe(305_000);
    });
    it('ignores an unconfirmed series: its line is raw spending', () => {
      const money = ok({ months: withLine(), bills: [{ ...yearly, confirmed: false }] });
      expect(money.smoothedBillsMonthly).toBe(0);
      expect(money.monthsUsed.find((x) => x.month === '2026-02')!.spending).toBe(420_000);
    });
    it('uses the latest amount, not the logged one', () => {
      expect(ok({ months: withLine(), bills: [{ ...yearly, latestAmount: m(132_000) }] }).smoothedBillsMonthly).toBe(
        11_000
      );
    });
    it('shares the equivalent in household scope, by category rule when there is one', () => {
      expect(ok({ months: base(), bills: [yearly], spendingShare: EVEN2 }).smoothedBillsMonthly).toBe(5_000);
      const rent = { ...yearly, categoryId: 'cat_rent' };
      expect(ok({ months: base(), bills: [rent], spendingShare: EVEN2_RENT }).smoothedBillsMonthly).toBe(7_500);
    });
  });

  it('keeps refunds out of income and steadiness', () => {
    const plain = ok({
      months: monthsOf([
        [500_000, 300_000],
        [500_000, 300_000],
        [500_000, 300_000],
      ]),
    });
    const ms = monthsOf([
      [500_000, 300_000],
      [500_000, 300_000],
      [500_000, 300_000],
    ]);
    ms[0] = fullMonth('2026-01', 500_000, 300_000, [
      line({ id: 'r', date: '2026-01-20', direction: 'in', amount: 50_000, isRefund: true }),
    ]);
    const money = ok({ months: ms });
    expect(money.incomeAverage).toBe(plain.incomeAverage);
    expect(money.incomeWorst).toBe(plain.incomeWorst);
    expect(money.steadiness).toBe(plain.steadiness);
    expect(money.monthsUsed.find((x) => x.month === '2026-01')!.spending).toBe(250_000);
  });

  it('keeps unmarked spikes in', () => {
    const money = ok({
      months: monthsOf([
        [1, 300_000],
        [1, 300_000],
        [1, 1_500_000],
      ]),
    });
    expect(money.spendingAverage).toBe(700_000);
    expect(money.spendingWorst).toBe(1_500_000);
  });

  it('leaves marked one-offs out and counts only the window', () => {
    const ms = monthsOf(Array.from({ length: 7 }, () => [500_000, 300_000] as const));
    ms[6] = fullMonth('2026-07', 500_000, 300_000, [
      line({ id: 'big', date: '2026-07-20', direction: 'out', amount: 1_200_000, oneOff: true }),
      line({ id: 'bonus', date: '2026-07-21', direction: 'in', amount: 80_000, oneOff: true }),
    ]);
    ms[0] = fullMonth('2026-01', 500_000, 300_000, [
      line({ id: 'old', date: '2026-01-20', direction: 'out', amount: 9_000, oneOff: true }),
    ]);
    const money = ok({ months: ms });
    expect(money.spendingAverage).toBe(300_000);
    expect(money.spendingWorst).toBe(300_000);
    expect(money.steadiness).toBe('steady');
    expect(money.incomeCvPercent).toBe(0);
    expect(money.oneOffsExcluded).toEqual({ count: 2, spending: 1_200_000, income: 80_000 });
  });

  it('guards inputs', () => {
    expect(() => run({ months: [fullMonth('2026-13', 1, 1)] })).toThrow(/^deriveMoney: /);
    expect(() => run({ months: [fullMonth('26-01', 1, 1)] })).toThrow(/^deriveMoney: /);
    expect(() => run({ months: [fullMonth('2026-01', 1, 1), fullMonth('2026-01', 1, 1)] })).toThrow(/^deriveMoney: /);
    const b = bill({ seriesId: 'b', freq: 'yearly', anchorDate: '2026-01-01', latestAmount: 1 });
    expect(() => run({ months: incomes([1]), bills: [{ ...b, currency: currencyCode('CAD') }] })).toThrow(
      /mixed currencies/
    );
    expect(() => run({ months: incomes([1]), bills: [{ ...b, freq: 'daily' as never }] })).toThrow(RangeError);
    const s = income({ seriesId: 'p', freq: 'weekly', anchorDate: '2026-01-02', latestAmount: 1 });
    expect(() => run({ months: incomes([1]), incomeSeries: [{ ...s, currency: currencyCode('CAD') }] })).toThrow(
      /mixed currencies/
    );
    expect(() => run({ months: incomes([1]), incomeSeries: [{ ...s, freq: 'daily' as never }] })).toThrow(RangeError);
    expect(() => run({ months: incomes([1]), bills: [{ ...b, seriesId: 'p' }], incomeSeries: [s] })).toThrow(
      /^deriveMoney: /
    );
  });
});

// D-60 mechanics shared with the deviation file: shapes and boundary behaviour of the pay series.
describe('deriveMoney pay-series mechanics', () => {
  const payMonth = (key: string, dates: string[], amount = 200_000) =>
    fullMonth(
      key,
      0,
      300_000,
      dates.map((date) => line({ id: `pay-${date}`, date, direction: 'in', amount, seriesId: 'pay' }))
    );
  const jan = (anchor: string, freq: 'weekly' | 'fortnightly') =>
    income({ seriesId: 'pay', freq, anchorDate: anchor, latestAmount: 200_000 });
  const run1 = (series: ReturnType<typeof income>, dates: string[]) => {
    const r = deriveMoney({
      currency: USD,
      months: [payMonth('2026-01', dates)],
      bills: [],
      incomeSeries: [series],
      basisOverride: null,
      spendingShare: PERSONAL,
    });
    if (!r.ok) throw new Error('expected ok');
    return r.money.incomeAverage;
  };

  it('fortnightly full-month boundary: anchor 14 January is smoothed, 15 January is logged', () => {
    expect(run1(jan('2026-01-14', 'fortnightly'), ['2026-01-14'])).toBe(433_333);
    expect(run1(jan('2026-01-15', 'fortnightly'), ['2026-01-15'])).toBe(200_000);
  });
  it('weekly full-month boundary: anchor 7 January is smoothed, 8 January is logged', () => {
    expect(run1(jan('2026-01-07', 'weekly'), ['2026-01-07'])).toBe(Math.round((200_000 * 52) / 12));
    expect(run1(jan('2026-01-08', 'weekly'), ['2026-01-08'])).toBe(200_000);
  });
  it('a series that ends in the month, by endDate or by occurrence count, keeps logged lines', () => {
    const f = jan('2026-01-02', 'fortnightly');
    expect(run1({ ...f, endDate: '2026-01-31' }, ['2026-01-02'])).toBe(200_000);
    expect(run1({ ...f, endDate: '2026-02-01' }, ['2026-01-02'])).toBe(433_333);
    expect(run1({ ...f, occurrenceCount: 3 }, ['2026-01-02'])).toBe(200_000); // last date 2026-01-30
    expect(run1({ ...f, occurrenceCount: 4 }, ['2026-01-02'])).toBe(433_333); // last date 2026-02-13
    expect(run1({ ...f, occurrenceCount: 4, endDate: '2026-01-31' }, ['2026-01-02'])).toBe(200_000);
    expect(run1({ ...f, occurrenceCount: 2, endDate: '2026-03-01' }, ['2026-01-02'])).toBe(200_000);
  });
  it('does not smooth a monthly pay series', () => {
    expect(run1({ ...jan('2026-01-02', 'weekly'), freq: 'monthly' }, ['2026-01-02'])).toBe(200_000);
  });
});
