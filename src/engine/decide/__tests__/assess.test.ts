import { minorUnits, currencyCode } from '../../money/types';
import { ZERO_PERCENT, percent } from '../../payoff/types';
import { CASH_PATH_DAYS } from '../constants';
import { cashPathForSnapshot } from '../cashPath';
import { prepareContext } from '../assess';
import { SOLE_SHARE } from '../share';
import type { AssessContext, DebtRecord, DecideLimits, DecideSnapshot, MonthRecord } from '../types';
import { USD, bill, fullMonth, income, line, monthsOf, outflow, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;
const CAD = currencyCode('CAD');

// ── shared fixtures (plan 04-07) ──
const D1: DebtRecord = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = {
  id: 'd2',
  balance: mu(15_000_000),
  minimumPayment: mu(90_000),
  secured: true,
  apr: percent('5.1'),
  currency: USD,
};
const B = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: mu(25_000), monthlyInvesting: mu(40_000), ...over });
const LIMITS_BL: DecideLimits = {
  reserve: mu(600_000),
  dsrLine: percent('36'),
  unsecuredIncomeMultiple: 12,
  investingFloor: mu(40_000),
  savingFloor: mu(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => B({ limits: LIMITS_BL, ...over });
const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const PB = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ incomeSeries: [PAY], ...over });
const OUT_AHEAD = outflow({ id: 'o_ahead', date: '2026-07-30', amount: 50_000 });
const OUT_PAST = outflow({ id: 'o_past', date: '2026-07-07', amount: 50_000 });
const OUT_TODAY = outflow({ id: 'o_today', date: '2026-07-10', amount: 50_000 });
const OUT_EDGE = outflow({ id: 'o_edge', date: '2026-10-08', amount: 50_000 });
const OUT_LATE = outflow({ id: 'o_late', date: '2026-10-09', amount: 50_000 });

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}

describe('prepareContext (DEC-06; D-01..D-06, D-23, D-24, D-32, D-34)', () => {
  it('derives debts, costs, pausable and left from the base fixture', () => {
    const c = ctxOf(B());
    expect(c.debtBalance).toBe(15_800_000);
    expect(c.annualIncome).toBe(7_200_000);
    expect(c.debtPayments).toBe(110_000);
    expect(c.unsecuredDebt).toBe(800_000);
    expect(c.monthCosts).toBe(410_000);
    expect(c.pausable).toBe(65_000);
    expect(c.leftBefore).toBe(125_000);
    expect(c.leftThisMonth).toBe(125_000);
    expect(c.billsDue).toBe(0);
    expect(c.billsDueDetail).toEqual([]);
    expect(c.cashAvailable).toBe(2_000_000);
    expect(c.cashAfterBills).toBe(2_000_000);
    expect(c.ledgerCash).toBe(2_000_000);
    expect(c.highestUnsecuredApr).toEqual({ debtId: 'd1', apr: percent('19.9') });
    expect(c.purchaseShare).toEqual(SOLE_SHARE);
    expect(c.monthIncome).toBe(c.money.incomeBasis);
    expect(c.position).toBeNull();
    expect(c.cashPath).toBeNull();
    expect(c.limits.projectionRates).toEqual([{ rate: ZERO_PERCENT, userEntered: false, label: 'held_not_grown' }]);
    expect(ctxOf(B({ projectionRates: [percent('5')] })).limits.projectionRates.map((r) => r.rate)).toEqual([
      ZERO_PERCENT,
      percent('5'),
    ]);
    expect(c.outflowsDueNow).toBe(0);
    expect(c.outflowsDueAhead).toBe(0);
  });

  it('defaults every limit from the user own figures (D-01, D-04, D-05, D-06, D-42)', () => {
    const l = ctxOf(B()).limits;
    expect(l.reserve).toBe(1_230_000);
    expect(l.reserveHalfMonths).toBe(6);
    expect(l.dsrLine).toBe(percent('36'));
    expect(l.unsecuredLine).toBe(7_200_000);
    expect(l.unsecuredIncomeMultiple).toBe(12);
    expect(l.investingFloor).toBe(40_000);
    expect(l.savingFloor).toBe(25_000);
    expect(l.spareFloor).toBe(0);
    expect(l.projectionReturn).toBe(ZERO_PERCENT);
  });

  it('explicit limits win exactly', () => {
    const l = ctxOf(
      B({
        limits: {
          reserve: mu(600_000),
          dsrLine: percent('40'),
          unsecuredIncomeMultiple: 6,
          investingFloor: mu(10_000),
          savingFloor: mu(0),
          spareFloor: mu(2_500),
        },
        projectionReturn: percent('6.5'),
      })
    ).limits;
    expect(l.reserve).toBe(600_000);
    expect(l.reserveHalfMonths).toBeNull();
    expect(l.dsrLine).toBe(percent('40'));
    expect(l.unsecuredIncomeMultiple).toBe(6);
    expect(l.unsecuredLine).toBe(3_600_000);
    expect(l.investingFloor).toBe(10_000);
    expect(l.savingFloor).toBe(0);
    expect(l.spareFloor).toBe(2_500);
    expect(l.projectionReturn).toBe(percent('6.5'));
  });

  it('month costs use AVERAGE spending even on a worst basis (D-02)', () => {
    const c = ctxOf(
      B({
        months: monthsOf(
          [
            [400_000, 280_000],
            [600_000, 300_000],
            [800_000, 320_000],
          ],
          '2026-04'
        ),
      })
    );
    expect(c.mySpendingBasis).toBe(320_000);
    expect(c.monthCosts).toBe(300_000 + 110_000);
  });

  it('smoothed bills feed month costs and the cushion (D-23 into D-02, D-01)', () => {
    const yearlyFar = bill({
      seriesId: 's-ins',
      freq: 'yearly',
      anchorDate: '2026-03-20',
      lastPaidDate: '2026-03-20',
      latestAmount: 120_000,
    });
    const c = ctxOf(B({ bills: [yearlyFar] }));
    expect(c.money.spendingAverage).toBe(310_000);
    expect(c.monthCosts).toBe(420_000);
    expect(c.limits.reserve).toBe(1_260_000);
    expect(c.billsDue).toBe(0);
  });

  it('deducts confirmed bills due within 90 days from cash (D-24, D-25)', () => {
    const c = ctxOf(B({ bills: [YEARLY_DUE] }));
    expect(c.billsDue).toBe(120_000);
    expect(c.cashAvailable).toBe(1_880_000);
    expect(c.cashAfterBills).toBe(1_880_000);
    expect(c.ledgerCash).toBe(1_880_000);
    expect(c.billsDueDetail).toEqual([{ seriesId: 's-ins', categoryId: null, dates: ['2026-09-01'], amount: 120_000 }]);
    const paid = bill({
      seriesId: 's-ins',
      freq: 'yearly',
      anchorDate: '2025-07-05',
      lastPaidDate: '2026-07-05',
      latestAmount: 120_000,
    });
    expect(ctxOf(B({ bills: [paid] })).billsDue).toBe(0);
    const monthly = bill({ seriesId: 's-m', freq: 'monthly', anchorDate: '2026-01-11', latestAmount: 50_000 });
    expect(ctxOf(B({ bills: [monthly] })).billsDue).toBe(0);
    expect(ctxOf(B({ bills: [{ ...YEARLY_DUE, confirmed: false }] })).billsDue).toBe(0);
  });

  it('recorded monthly investments are paused like automatic investing (D-32)', () => {
    const c = ctxOf(B({ monthlyInvesting: mu(55_000) }));
    expect(c.monthCosts).toBe(410_000);
    expect(c.pausable).toBe(80_000);
    expect(c.limits.investingFloor).toBe(55_000);
  });

  it('uses two shares in a household (D-34)', () => {
    const base = {
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } } as const,
      householdSpending: { rule: { kind: 'even' } as const, byCategory: [] },
    };
    const mine = ctxOf(B(base));
    expect(mine.mySpendingBasis).toBe(150_000);
    expect(mine.monthCosts).toBe(260_000);
    expect(mine.limits.reserve).toBe(780_000);
    expect(mine.purchaseShare).toEqual(SOLE_SHARE);
    const even = ctxOf(B({ ...base, scope: { ...base.scope, rule: { kind: 'even' } } }));
    expect(even.mySpendingBasis).toBe(150_000);
    expect(even.monthCosts).toBe(260_000);
    expect(even.limits.reserve).toBe(780_000);
    expect(even.purchaseShare.weights).toEqual([1, 1]);
    expect(ctxOf(B({ ...base, bills: [YEARLY_DUE] })).billsDue).toBe(60_000);
  });

  it('shares existing spending per category (D-34)', () => {
    const months: MonthRecord[] = ['2026-04', '2026-05', '2026-06'].map((m) => ({
      month: m,
      full: true,
      lines: [
        line({ id: `${m}-in`, date: `${m}-15`, direction: 'in', amount: 600_000 }),
        line({ id: `${m}-rent`, date: `${m}-15`, direction: 'out', amount: 200_000, categoryId: 'cat_rent' }),
        line({ id: `${m}-food`, date: `${m}-15`, direction: 'out', amount: 100_000, categoryId: 'cat_food' }),
      ],
    }));
    const c = ctxOf(
      B({
        months,
        scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
        householdSpending: {
          rule: { kind: 'even' },
          byCategory: [{ categoryId: 'cat_rent', rule: { kind: 'weight', weights: [3, 1] } }],
        },
      })
    );
    expect(c.mySpendingBasis).toBe(150_000 + 50_000);
  });

  it('reports why the context cannot be resolved, with the money-basis confidence (D-46)', () => {
    const noMonth = prepareContext(B({ months: [] }));
    expect(noMonth).toEqual({
      ok: false,
      reasons: ['no_full_month'],
      confidence: { level: 'rough', reasons: ['under_3_full_months'] },
    });
    const zero = {
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [0, 0] } } as const,
      householdSpending: { rule: { kind: 'even' } as const, byCategory: [] },
    };
    expect(prepareContext(B(zero))).toEqual({
      ok: false,
      reasons: ['split_weights_zero'],
      confidence: { level: 'fair', reasons: ['under_6_full_months'] },
    });
    const hhZero = {
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } } as const,
      householdSpending: { rule: { kind: 'weight', weights: [0, 0] } as const, byCategory: [] },
    };
    const r1 = prepareContext(B(hhZero));
    expect(r1.ok ? [] : r1.reasons).toEqual(['split_weights_zero']);
    const r2 = prepareContext(B({ ...hhZero, scope: zero.scope }));
    expect(r2.ok ? [] : r2.reasons).toEqual(['split_weights_zero']);
    const r3 = prepareContext(B({ ...zero, months: [] }));
    expect(r3.ok ? [] : r3.reasons).toEqual(['no_full_month', 'split_weights_zero']);
  });

  it('picks the highest unsecured APR, ties to the smallest id (D-31 input)', () => {
    const a0: DebtRecord = { ...D1, id: 'a0' };
    expect(ctxOf(B({ debts: [D1, a0, D2] })).highestUnsecuredApr?.debtId).toBe('a0');
    expect(ctxOf(B({ debts: [{ ...D1, apr: null }, D2] })).highestUnsecuredApr).toBeNull();
    expect(ctxOf(B({ debts: [D2] })).highestUnsecuredApr).toBeNull();
    expect(ctxOf(B({ debts: [] })).highestUnsecuredApr).toBeNull();
  });

  it('rejects malformed snapshots', () => {
    const bad = (s: DecideSnapshot, re: RegExp) => expect(() => prepareContext(s)).toThrow(re);
    bad(B({ debts: [{ ...D1, balance: mu(-1) }] }), /^prepareContext: /);
    bad(B({ debts: [{ ...D1, minimumPayment: mu(-1) }] }), /^prepareContext: /);
    bad(B({ monthlySaving: -1 as never }), /^prepareContext: /);
    bad(B({ monthlyInvesting: -1 as never }), /^prepareContext: /);
    bad(
      B({ limits: { ...LIMITS_BL, unsecuredIncomeMultiple: 1.5 } }),
      /^prepareContext: /
    );
    bad(B({ limits: { ...LIMITS_BL, unsecuredIncomeMultiple: -1 } }), /^prepareContext: /);
    bad(B({ asOf: '2026-02-30' }), /^prepareContext: /);
    bad(B({ debts: [{ ...D1, currency: CAD }] }), /^prepareContext: mixed currencies/);
    bad(B({ bills: [{ ...YEARLY_DUE, currency: CAD }] }), /mixed currencies/);
    bad(
      B({ scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } }, householdSpending: null }),
      /^resolveSpendingShare: /
    );
    bad(B({ incomeSeries: [{ ...PAY, currency: CAD }] }), /mixed currencies/);
    bad(B({ scheduledOutflows: [{ ...OUT_PAST, currency: CAD }] }), /^prepareContext: mixed currencies.*scheduled outflow o_past/);
    bad(B({ scheduledOutflows: [{ ...OUT_PAST, amount: mu(0) }] }), /^scheduledOutflowsDue: /);
  });

  it('(D-42) sets the cushion by steadiness', () => {
    const variable = ctxOf(
      B({
        months: monthsOf(
          [
            [560_000, 300_001],
            [560_000, 300_001],
            [640_000, 300_001],
            [640_000, 300_001],
          ],
          '2026-03'
        ),
      })
    );
    expect(variable.monthCosts).toBe(410_001);
    expect(variable.limits.reserve).toBe(1_845_005);
    expect(variable.limits.reserveHalfMonths).toBe(9);
    const volatileMonths = monthsOf(
      [
        [400_000, 300_000],
        [600_000, 300_000],
        [800_000, 300_000],
      ],
      '2026-04'
    );
    const vol = ctxOf(B({ months: volatileMonths }));
    expect(vol.limits.reserve).toBe(6 * vol.monthCosts);
    expect(vol.limits.reserveHalfMonths).toBe(12);
    const two = ctxOf(B({ months: monthsOf([[600_000, 300_000], [600_000, 300_000]], '2026-05') }));
    expect(two.limits.reserve).toBe(3 * two.monthCosts);
    expect(two.limits.reserveHalfMonths).toBe(6);
    const typed = ctxOf(B({ months: volatileMonths, limits: { ...LIMITS_BL, reserve: mu(600_000) } }));
    expect(typed.limits.reserve).toBe(600_000);
    expect(typed.limits.reserveHalfMonths).toBeNull();
  });

  it('(D-44) builds the cash path only with a confirmed pay series', () => {
    expect(ctxOf(B()).cashPath).toBeNull();
    const s = B({ incomeSeries: [PAY] });
    const c = ctxOf(s);
    expect(c.cashPath?.balances).toHaveLength(CASH_PATH_DAYS + 1);
    expect(c.cashPath).toEqual(
      cashPathForSnapshot({ snapshot: s, money: c.money, spendingShare: c.spendingShare, debtPayments: c.debtPayments })
    );
  });

  it('keeps the D-24 bill in spare money when a path carries it (D-24/D-44 amended)', () => {
    const withPath = ctxOf(B({ incomeSeries: [PAY], bills: [YEARLY_DUE] }));
    expect(withPath.billsDue).toBe(120_000);
    expect(withPath.billsDueDetail).toHaveLength(1);
    expect(withPath.cashAvailable).toBe(2_000_000);
    expect(withPath.cashAfterBills).toBe(1_880_000);
    expect(withPath.ledgerCash).toBe(1_880_000);
    const noPath = ctxOf(B({ bills: [YEARLY_DUE] }));
    expect(noPath.cashAvailable).toBe(1_880_000);
    expect(noPath.cashAfterBills).toBe(1_880_000);
    expect(noPath.ledgerCash).toBe(1_880_000);
  });

  it('(D-60) smooths a confirmed fortnightly pay series before steadiness and the cushion', () => {
    const dates = [
      '2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13', '2026-02-27', '2026-03-13', '2026-03-27',
      '2026-04-10', '2026-04-24', '2026-05-08', '2026-05-22', '2026-06-05', '2026-06-19',
    ];
    const months = ['01', '02', '03', '04', '05', '06'].map((mm) =>
      fullMonth(
        `2026-${mm}`,
        0,
        300_000,
        dates
          .filter((d) => d.slice(5, 7) === mm)
          .map((d) => line({ id: `pay-${d}`, date: d, direction: 'in', amount: 200_000, seriesId: 'pay' }))
      )
    );
    const payF = income({
      seriesId: 'pay',
      freq: 'fortnightly',
      anchorDate: '2026-01-02',
      lastPaidDate: '2026-06-19',
      latestAmount: 200_000,
    });
    const smooth = ctxOf(snapshotOf({ months, incomeSeries: [payF] }));
    expect(smooth.money.steadiness).toBe('steady');
    expect(smooth.money.incomeBasis).toBe(433_333);
    expect(smooth.limits.reserveHalfMonths).toBe(6);
    expect(smooth.limits.reserve).toBe(900_000);
    const raw = ctxOf(snapshotOf({ months, incomeSeries: [{ ...payF, confirmed: false }] }));
    expect(raw.money.steadiness).toBe('variable');
    expect(raw.money.incomeBasis).toBe(400_000);
    expect(raw.limits.reserveHalfMonths).toBe(9);
    expect(raw.limits.reserve).toBe(1_350_000);
  });

  describe('scheduled outflows (D-61)', () => {
    const figs = (c: AssessContext) => [c.cashAvailable, c.ledgerCash, c.cashAfterBills];
    it('a future-dated outflow reaches spare money only', () => {
      const c = ctxOf(B({ scheduledOutflows: [OUT_AHEAD] }));
      expect(c.outflowsDueNow).toBe(0);
      expect(c.outflowsDueAhead).toBe(50_000);
      expect(figs(c)).toEqual([2_000_000, 2_000_000, 1_950_000]);
      const p = ctxOf(PB({ scheduledOutflows: [OUT_AHEAD] }));
      const base = ctxOf(PB());
      expect(p.outflowsDueAhead).toBe(50_000);
      expect(figs(p)).toEqual([2_000_000, 2_000_000, 1_950_000]);
      expect(p.cashPath!.balances[19]).toBe(2_330_411);
      expect(p.cashPath!.balances[20]).toBe(2_266_932);
      for (let d = 20; d <= 90; d++) {
        expect(p.cashPath!.balances[d]).toBe(base.cashPath!.balances[d]! - 50_000);
      }
      for (let d = 0; d < 20; d++) expect(p.cashPath!.balances[d]).toBe(base.cashPath!.balances[d]);
    });

    it('an outflow dated on or before asOf reduces every cash figure and sits on day 0', () => {
      for (const o of [OUT_PAST, OUT_TODAY]) {
        const p = ctxOf(PB({ scheduledOutflows: [o] }));
        expect(p.outflowsDueNow).toBe(50_000);
        expect(figs(p)).toEqual([1_950_000, 1_950_000, 1_950_000]);
        expect(figs(ctxOf(B({ scheduledOutflows: [o] })))).toEqual([1_950_000, 1_950_000, 1_950_000]);
      }
      expect(ctxOf(PB({ scheduledOutflows: [OUT_PAST] })).cashPath!.balances[0]).toBe(1_936_521);
    });

    it('applies the 90-day window edge', () => {
      const e = ctxOf(PB({ scheduledOutflows: [OUT_EDGE] }));
      const base = ctxOf(PB());
      expect(e.outflowsDueAhead).toBe(50_000);
      expect(figs(e)).toEqual([2_000_000, 2_000_000, 1_950_000]);
      expect(e.cashPath!.balances[90]).toBe(base.cashPath!.balances[90]! - 50_000);
      expect(e.cashPath!.balances[89]).toBe(base.cashPath!.balances[89]);
      for (const s of [PB, B]) {
        const late = ctxOf(s({ scheduledOutflows: [OUT_LATE] }));
        expect(late.outflowsDueAhead).toBe(0);
        expect(figs(late)).toEqual(figs(ctxOf(s())));
      }
      expect(ctxOf(PB({ scheduledOutflows: [OUT_LATE] })).cashPath).toEqual(base.cashPath);
    });

    it('combines bills with outflows', () => {
      const s = { bills: [YEARLY_DUE], scheduledOutflows: [OUT_AHEAD, OUT_PAST] };
      expect(figs(ctxOf(B(s)))).toEqual([1_830_000, 1_830_000, 1_780_000]);
      expect(figs(ctxOf(PB(s)))).toEqual([1_950_000, 1_830_000, 1_780_000]);
    });

    it('never re-shares an outflow in a household', () => {
      const c = ctxOf(
        B({
          scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
          householdSpending: { rule: { kind: 'even' }, byCategory: [] },
          scheduledOutflows: [OUT_PAST],
        })
      );
      expect(c.outflowsDueNow).toBe(50_000);
    });
  });
});
