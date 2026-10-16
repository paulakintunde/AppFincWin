import fc from 'fast-check';
import { minorUnits, currencyCode } from '../../money/types';
import { divideHalfUp } from '../../money/rounding';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, percent, percentFromScaled } from '../../payoff/types';
import { CASH_PATH_DAYS } from '../constants';
import { cashPathForSnapshot, classifyCashDip, lowestPoint } from '../cashPath';
import { assess, assessPlan, prepareContext, purchaseSize } from '../assess';
import { resolvePlanStrict } from '../plan';
import { SOLE_SHARE, myPart } from '../share';
import type {
  AssessContext,
  Assessment,
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
  InvestCheck,
  MonthRecord,
  PurchaseCheck,
} from '../types';
import { USD, bill, buyCash, fullMonth, income, line, monthsOf, outflow, snapshotOf } from './helpers/fixtures';

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
    bad(B({ limits: { ...LIMITS_BL, unsecuredIncomeMultiple: 1.5 } }), /^prepareContext: /);
    bad(B({ limits: { ...LIMITS_BL, unsecuredIncomeMultiple: -1 } }), /^prepareContext: /);
    bad(B({ asOf: '2026-02-30' }), /^prepareContext: /);
    bad(B({ debts: [{ ...D1, currency: CAD }] }), /^prepareContext: mixed currencies/);
    bad(B({ bills: [{ ...YEARLY_DUE, currency: CAD }] }), /mixed currencies/);
    bad(
      B({ scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } }, householdSpending: null }),
      /^resolveSpendingShare: /
    );
    bad(B({ incomeSeries: [{ ...PAY, currency: CAD }] }), /mixed currencies/);
    bad(
      B({ scheduledOutflows: [{ ...OUT_PAST, currency: CAD }] }),
      /^prepareContext: mixed currencies.*scheduled outflow o_past/
    );
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
    const two = ctxOf(
      B({
        months: monthsOf(
          [
            [600_000, 300_000],
            [600_000, 300_000],
          ],
          '2026-05'
        ),
      })
    );
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
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
      '2026-02-27',
      '2026-03-13',
      '2026-03-27',
      '2026-04-10',
      '2026-04-24',
      '2026-05-08',
      '2026-05-22',
      '2026-06-05',
      '2026-06-19',
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

// ── Task 2: assessPlan ──
const INST = (a: number, over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(12 * a, {
    payment: { method: 'instalment', instalmentAmount: mu(a), instalmentCount: 12 },
    ...over,
  });
const investMonthly = (monthly: number, n: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: mu(monthly),
  payment: { method: 'monthly', termMonths: n },
});
const investLump = (amount: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: mu(amount),
  payment: { method: 'lump' },
});
const R = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  BL({
    months: monthsOf(
      [
        [1_000_000, 700_000],
        [1_000_000, 700_000],
        [1_000_000, 700_000],
      ],
      '2026-04'
    ),
    ...over,
  });
const BILL_BEFORE_PAY = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-07-24',
  lastPaidDate: '2025-07-24',
  latestAmount: 120_000,
});
function run(s: DecideSnapshot, check: PurchaseCheck): Assessment {
  return assessPlan(ctxOf(s), check, resolvePlanStrict(check));
}
const w = (code: string, shortfall: number) => ({ code, shortfall });
function percentOf(n: number, d: number) {
  return percentFromScaled(divideHalfUp(BigInt(n) * ONE_HUNDRED_PERCENT, BigInt(d)));
}
function available(a: Assessment) {
  if (a.cashPath.status !== 'available') throw new Error('expected an available cash path');
  return a.cashPath;
}

describe('assessPlan ledgers and one warning at a time (DEC-06)', () => {
  it('fits with nothing to report', () => {
    const a = run(BL(), buyCash(100_000));
    expect(a.state).toBe('fits');
    expect(a.warnings).toEqual([]);
    expect(a.cashAfter).toBe(1_900_000);
    expect(a.left).toBe(125_000);
    expect(a.pauseNeeded).toBe(0);
    expect(a.remainingShortfall).toBe(0);
    expect(a.checks).toEqual({ cash: true, month: true, dsr: true, owe: true, inv: true, save: true });
    expect(a.facts).toEqual([]);
    expect(a.basisMarker).toBe('logged_months');
  });

  it('cash below the cushion adjusts; cash below zero is no', () => {
    expect(run(BL(), buyCash(1_500_000))).toMatchObject({ state: 'adjust', warnings: [w('cash', 100_000)] });
    expect(run(BL(), buyCash(2_100_000))).toMatchObject({
      state: 'no',
      warnings: [w('cash', 700_000)],
      cashAfter: -100_000,
    });
  });

  it('deducts the bill due within 90 days from cash without a path (D-24 in the ledger)', () => {
    const a = run(BL({ bills: [YEARLY_DUE] }), buyCash(1_300_000));
    expect(a.cashAfter).toBe(580_000);
    expect(a.warnings).toEqual([w('cash', 20_000)]);
    expect(a.state).toBe('adjust');
    const b = run(BL(), buyCash(1_300_000));
    expect(b.cashAfter).toBe(700_000);
    expect(b.warnings).toEqual([]);
  });

  it('the debt-service line breaches only strictly above it', () => {
    const a = run(BL(), INST(120_000));
    expect(a.warnings).toEqual([w('dsr', 14_000)]);
    expect(a.left).toBe(5_000);
    expect(a.state).toBe('adjust');
    expect(a.debtServiceRatioBefore).toBe(percentOf(110_000, 600_000));
    expect(a.debtServiceRatioAfter).toBe(percentOf(230_000, 600_000));
    expect(a.checks.dsr).toBe(false);
    expect(a.checks.owe).toBe(true);
    const edge = run(BL(), INST(106_000)); // exactly 216_000
    expect(edge.warnings).toEqual([]);
    expect(edge.checks.dsr).toBe(true);
  });

  it('has no debt-service ratio or warning when the money basis is 0', () => {
    const s = BL({
      months: monthsOf(
        [
          [0, 300_000],
          [0, 300_000],
          [0, 300_000],
        ],
        '2026-04'
      ),
    });
    const a = run(s, buyCash(1_000));
    expect(a.debtServiceRatioBefore).toBeNull();
    expect(a.debtServiceRatioAfter).toBeNull();
    expect(a.warnings.map((x) => x.code)).not.toContain('dsr');
  });

  it('adds the financed amount to total debt on buy checks only', () => {
    expect(run(BL(), INST(120_000)).debtBalanceAfter).toBe(15_800_000 + 1_440_000);
    expect(run(BL(), buyCash(100_000)).debtBalanceAfter).toBe(15_800_000);
    expect(run(BL(), investLump(50_000)).debtBalanceAfter).toBe(15_800_000);
  });

  it('the unsecured line breaches only strictly above it', () => {
    const slow = (price: number) =>
      buyCash(price, { payment: { method: 'instalment', instalmentAmount: mu(10_000), instalmentCount: 600 } });
    const over = run(BL(), slow(6_500_001));
    expect(over.unsecuredAfter).toBe(7_300_001);
    expect(over.warnings).toEqual([w('owe', 100_001)]);
    expect(over.state).toBe('adjust');
    expect(over.checks.owe).toBe(false);
    const edge = run(BL(), slow(6_400_000));
    expect(edge.unsecuredAfter).toBe(7_200_000);
    expect(edge.checks.owe).toBe(true);
    expect(edge.warnings).toEqual([]);
  });

  it('running costs change the new monthly figure', () => {
    expect(run(BL(), buyCash(100_000, { runningCostsNet: mu(5_500) })).newMonthly).toBe(5_500);
    const down = run(BL(), buyCash(100_000, { runningCostsNet: mu(-3_000) }));
    expect(down.newMonthly).toBe(-3_000);
    expect(down.left).toBe(128_000);
  });

  it('uses the purchase share for the purchase only in a household (D-34)', () => {
    const hh = (rule: 'even' | 'mine') =>
      BL({
        scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: rule } },
        householdSpending: { rule: { kind: 'even' }, byCategory: [] },
      });
    const c = ctxOf(hh('even'));
    const chk = INST(120_001);
    const a = assessPlan(c, chk, resolvePlanStrict(chk));
    expect(a.mineDayOne).toBe(myPart(a.plan.dayOne, c.purchaseShare));
    expect(a.mineMonthly).toBe(myPart(a.plan.monthly, c.purchaseShare));
    expect(a.unsecuredAfter).toBe(c.unsecuredDebt + myPart(a.plan.financed, c.purchaseShare));
    const m = run(hh('mine'), buyCash(300_000));
    expect(m.mineDayOne).toBe(300_000);
    expect(m.context.mySpendingBasis).toBe(150_000);
  });

  it('burn adds this decision to the existing outgoings', () => {
    const a = run(BL(), INST(10_000, { runningCostsNet: mu(500) }));
    expect(a.burn).toBe(a.context.mySpendingBasis + a.context.debtPayments + a.newMonthly);
  });
});

describe('assessPlan pause rule (D-35)', () => {
  it('pauses investing first, then saving, and stays adjust within pausable', () => {
    const a = run(R(), INST(150_000));
    expect(a).toMatchObject({
      left: -25_000,
      investingAtRisk: 25_000,
      savingAtRisk: 0,
      pauseNeeded: 25_000,
      remainingShortfall: 0,
      state: 'adjust',
      warnings: [w('inv', 25_000)],
    });
    expect(a.checks.month).toBe(true);
    expect(a.checks.inv).toBe(false);
    expect(a.investingAfter).toBe(15_000);
    const b = run(R(), INST(180_000));
    expect(b).toMatchObject({
      left: -55_000,
      investingAtRisk: 40_000,
      savingAtRisk: 15_000,
      savingAfter: 10_000,
      state: 'adjust',
    });
    expect(b.warnings).toEqual([w('inv', 55_000)]);
    expect(b.checks.save).toBe(false);
    const c = run(R(), INST(190_000));
    expect(c).toMatchObject({ left: -65_000, state: 'adjust' });
    expect(c.warnings).toEqual([w('inv', 65_000)]);
  });

  it('is no when the month still does not close after pausing everything', () => {
    const a = run(R(), INST(200_000));
    expect(a).toMatchObject({ left: -75_000, pauseNeeded: 65_000, remainingShortfall: 10_000, state: 'no' });
    expect(a.warnings).toEqual([w('inv', 65_000), w('month', 10_000)]);
    expect(a.checks.month).toBe(false);
  });

  it('reports the pause even when floors are 0', () => {
    const a = run(R({ limits: { ...LIMITS_BL, investingFloor: mu(0), savingFloor: mu(0) } }), INST(150_000));
    expect(a.warnings).toEqual([w('inv', 25_000)]);
  });

  it('orders equal shortfalls by WARNING_ORDER', () => {
    const a = run(R({ limits: { ...LIMITS_BL, reserve: mu(1_875_000) } }), INST(150_000));
    expect(a.warnings).toEqual([w('cash', 25_000), w('inv', 25_000)]);
  });

  it('has no inv warning when nothing can be paused', () => {
    const s = R({
      monthlySaving: mu(0),
      monthlyInvesting: mu(0),
      limits: { ...LIMITS_BL, investingFloor: null, savingFloor: null },
    });
    const a = run(s, INST(200_000));
    expect(a.state).toBe('no');
    expect(a.warnings).toEqual([w('month', 10_000)]);
  });

  it('sorts a combination of all five by shortfall descending', () => {
    const s = R({
      limits: { ...LIMITS_BL, reserve: mu(1_900_000), dsrLine: percent('20'), unsecuredIncomeMultiple: 0 },
    });
    const a = run(s, INST(200_000));
    expect(a.warnings).toEqual([
      w('owe', 3_200_000),
      w('dsr', 110_000),
      w('cash', 100_000),
      w('inv', 65_000),
      w('month', 10_000),
    ]);
    expect(a.warnings.length).toBeLessThanOrEqual(6);
  });
});

describe('assessPlan invest checks (D-33)', () => {
  it('carries the whole shortfall as month and never inv', () => {
    const a = run(R(), investMonthly(150_000, 24));
    expect(a.state).toBe('no');
    expect(a.warnings).toEqual([w('month', 25_000)]);
    expect(a).toMatchObject({
      investingAtRisk: 25_000,
      pauseNeeded: 25_000,
      remainingShortfall: 25_000,
      mineRunning: 0,
    });
  });

  it('never emits debt-line warnings', () => {
    const s = BL({ limits: { ...LIMITS_BL, dsrLine: percent('10'), unsecuredIncomeMultiple: 0 } });
    expect(
      run(s, buyCash(50_000))
        .warnings.map((x) => x.code)
        .sort()
    ).toEqual(['dsr', 'owe']);
    const inv = run(s, investLump(50_000));
    expect(inv.warnings).toEqual([]);
    expect(inv.state).toBe('fits');
  });
});

describe('assessPlan cash path (D-44, D-46, D-47, D-59, D-61)', () => {
  const noReserve = { ...LIMITS_BL, reserve: mu(0) };

  it('reports the path as unavailable without a confirmed pay series', () => {
    const a = run(BL(), buyCash(100_000));
    expect(a.cashPath).toEqual({ status: 'unavailable', code: 'cash_path_unavailable' });
    expect(a.cashDip).toBeNull();
    expect(a.basisCodes).toEqual(['cash_path_unavailable']);
  });

  it('carries both paths and their lowest days', () => {
    const a = run(PB(), buyCash(100_000));
    const p = available(a);
    expect(p.withPurchase[0]).toBe(p.withoutPurchase[0]! - 100_000);
    p.withPurchase.forEach((b, d) => expect(b).toBeLessThanOrEqual(p.withoutPurchase[d]!));
    expect(p.lowestWith).toEqual(lowestPoint({ asOf: '2026-07-10', balances: p.withPurchase }));
    expect(p.lowestWithout).toEqual(lowestPoint({ asOf: '2026-07-10', balances: p.withoutPurchase }));
    expect(a.basisCodes).toEqual([]);
  });

  it('fires cash_dip exactly when classifyCashDip does', () => {
    for (const price of [100_000, 1_300_000, 1_900_000]) {
      const a = run(PB(), buyCash(price));
      const p = available(a);
      const dip = classifyCashDip({
        lowestWith: p.lowestWith.amount,
        lowestWithout: p.lowestWithout.amount,
        reserve: a.context.limits.reserve,
        cashAfter: a.cashAfter,
        cashOnHand: a.context.cashAvailable,
      });
      const dips = a.warnings.filter((x) => x.code === 'cash_dip');
      if (dip === null) {
        expect(dips).toEqual([]);
        expect(a.cashDip).toBeNull();
      } else {
        expect(dips).toEqual([w('cash_dip', dip.shortfall)]);
        expect(a.cashDip).toBe(dip.severity);
      }
    }
  });

  it('a hard dip caused by the purchase is no', () => {
    const a = run(PB({ cashOnHand: mu(250_000), limits: noReserve }), buyCash(100_000));
    const p = available(a);
    expect(a.cashAfter).toBe(150_000);
    expect(p.lowestWithout).toEqual({ day: 14, date: '2026-07-24', amount: 47_808 });
    expect(p.lowestWith.amount).toBe(-52_192);
    expect(a.warnings).toEqual([w('cash_dip', 52_192)]);
    expect(a.cashDip).toBe('hard');
    expect(a.state).toBe('no');
  });

  it('counts only the extra depth when the path also dips without the purchase (D-59)', () => {
    const a = run(PB({ cashOnHand: mu(150_000), limits: noReserve }), buyCash(100_000));
    const p = available(a);
    expect(a.cashAfter).toBe(50_000);
    expect(p.lowestWithout).toEqual({ day: 14, date: '2026-07-24', amount: -52_192 });
    expect(p.lowestWith.amount).toBe(-152_192);
    expect(a.warnings).toEqual([w('cash_dip', 100_000)]);
    expect(a.cashDip).toBe('hard');
    expect(a.state).toBe('no');
    const fact = { code: 'cash_tight_before_payday', date: '2026-07-24', amount: -52_192 };
    expect(p.tightBeforePayday).toEqual(fact);
    expect(a.facts).toEqual([fact]);
  });

  it('a purchase that does not lower the low raises no dip, only the fact (D-59)', () => {
    const loan = buyCash(120_000, {
      payment: { method: 'loan', deposit: mu(0), termMonths: 12, apr: ZERO_PERCENT },
    });
    const a = run(PB({ cashOnHand: mu(150_000), limits: noReserve }), loan);
    const p = available(a);
    const low = { day: 14, date: '2026-07-24', amount: -52_192 };
    expect(p.lowestWith).toEqual(low);
    expect(p.lowestWithout).toEqual(low);
    expect(a.cashDip).toBeNull();
    expect(a.warnings).toEqual([]);
    expect(a.state).toBe('fits');
    expect(a.facts).toEqual([{ code: 'cash_tight_before_payday', date: '2026-07-24', amount: -52_192 }]);
    expect(p.withPurchase[45]).toBe(119_945);
    expect(p.withPurchase[76]).toBe(292_082);
    expect(p.withPurchase[90]).toBe(703_370);
  });

  it('deepens a soft dip below the cushion (D-59)', () => {
    const a = run(PB({ cashOnHand: mu(400_000), limits: { ...LIMITS_BL, reserve: mu(200_000) } }), buyCash(100_000));
    const p = available(a);
    expect(a.cashAfter).toBe(300_000);
    expect(p.lowestWithout.amount).toBe(197_808);
    expect(p.lowestWith.amount).toBe(97_808);
    expect(a.facts).toEqual([{ code: 'cash_tight_before_payday', date: '2026-07-24', amount: 197_808 }]);
    expect(a.warnings).toEqual([w('cash_dip', 100_000)]);
    expect(a.cashDip).toBe('soft');
    expect(a.state).toBe('adjust');
  });

  it('shows one card per cause: a dated bill reaches the verdict through cash_dip', () => {
    const a = run(PB({ bills: [BILL_BEFORE_PAY] }), buyCash(1_300_000));
    expect(a.cashAfter).toBe(700_000);
    expect(a.checks.cash).toBe(true);
    expect(a.context.cashAfterBills).toBe(1_880_000);
    expect(a.cashAfterBillsAndPurchase).toBe(580_000);
    expect(available(a).lowestWith).toEqual({ day: 14, date: '2026-07-24', amount: 377_808 });
    expect(a.warnings).toEqual([w('cash_dip', 222_192)]);
    expect(a.cashDip).toBe('soft');
    expect(a.state).toBe('adjust');
    const plain = run(PB(), buyCash(1_300_000));
    expect(available(plain).lowestWith.amount).toBe(497_808);
    expect(plain.warnings).toEqual([w('cash_dip', 102_192)]);
  });

  it('keeps cashAfter equal to the ledger and bills-and-purchase figures when there is no path', () => {
    const a = run(BL({ bills: [YEARLY_DUE] }), buyCash(1_300_000));
    expect(a.cashAfter).toBe(580_000);
    expect(a.ledgerCashAfterPurchase).toBe(580_000);
    expect(a.cashAfterBillsAndPurchase).toBe(580_000);
  });

  it('flags one-off lines left out of the basis after cash_path_unavailable (D-47)', () => {
    const months = [
      fullMonth('2026-04', 600_000, 300_000, [
        line({ id: 'x', date: '2026-04-20', direction: 'out', amount: 10_000, oneOff: true }),
      ]),
      fullMonth('2026-05', 600_000, 300_000),
      fullMonth('2026-06', 600_000, 300_000),
    ];
    expect(run(BL({ months }), buyCash(1_000)).basisCodes).toEqual(['cash_path_unavailable', 'one_offs_excluded']);
    expect(run(PB({ months }), buyCash(1_000)).basisCodes).toEqual(['one_offs_excluded']);
  });

  it('carries the confidence from the money basis (D-46)', () => {
    expect(run(B(), buyCash(1_000)).confidence).toEqual({ level: 'fair', reasons: ['under_6_full_months'] });
    const six = monthsOf(
      Array.from({ length: 6 }, () => [600_000, 300_000] as const),
      '2026-01'
    );
    expect(run(B({ months: six }), buyCash(1_000)).confidence).toEqual({ level: 'strong', reasons: [] });
    const vol = monthsOf(
      [
        [400_000, 300_000],
        [600_000, 300_000],
        [800_000, 300_000],
      ],
      '2026-04'
    );
    expect(run(B({ months: vol }), buyCash(1_000)).confidence).toEqual({
      level: 'rough',
      reasons: ['volatile_income'],
    });
  });

  it('(D-60) smoothed pay gives strong confidence end to end', () => {
    const dates = [
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
      '2026-02-27',
      '2026-03-13',
      '2026-03-27',
      '2026-04-10',
      '2026-04-24',
      '2026-05-08',
      '2026-05-22',
      '2026-06-05',
      '2026-06-19',
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
    expect(run(snapshotOf({ months, incomeSeries: [payF] }), buyCash(100_000)).confidence).toEqual({
      level: 'strong',
      reasons: [],
    });
    expect(
      run(snapshotOf({ months, incomeSeries: [{ ...payF, confirmed: false }] }), buyCash(100_000)).confidence
    ).toEqual({ level: 'fair', reasons: ['variable_income'] });
  });

  it('puts an outflow dated after asOf on its date, off the cash check (D-61)', () => {
    const a = run(PB({ scheduledOutflows: [OUT_AHEAD] }), buyCash(1_300_000));
    const p = available(a);
    expect(a.cashAfter).toBe(700_000);
    expect(a.checks.cash).toBe(true);
    expect(a.cashAfterBillsAndPurchase).toBe(650_000);
    expect(p.lowestWith).toEqual({ day: 14, date: '2026-07-24', amount: 497_808 });
    expect(p.lowestWithout.amount).toBe(1_797_808);
    expect(p.withPurchase[20]).toBe(966_932);
    expect(p.withPurchase[45]).toBe(629_945);
    expect(p.withPurchase[76]).toBe(812_082);
    expect(p.withPurchase[90]).toBe(1_223_370);
    expect(a.warnings).toEqual([w('cash_dip', 102_192)]);
    expect(a.cashDip).toBe('soft');
    expect(a.state).toBe('adjust');
  });

  it('puts an outflow dated on or before asOf on day 0 and into the cash check (D-61)', () => {
    for (const o of [OUT_PAST, OUT_TODAY]) {
      const a = run(PB({ scheduledOutflows: [o] }), buyCash(1_300_000));
      const p = available(a);
      expect(a.cashAfter).toBe(650_000);
      expect(p.lowestWith).toEqual({ day: 14, date: '2026-07-24', amount: 447_808 });
      expect(p.lowestWithout.amount).toBe(1_747_808);
      expect(a.warnings).toEqual([w('cash_dip', 152_192)]);
      expect(a.state).toBe('adjust');
    }
    const b = run(PB({ scheduledOutflows: [OUT_PAST] }), buyCash(1_380_000));
    expect(b.cashAfter).toBe(570_000);
    expect(available(b).lowestWith.amount).toBe(367_808);
    expect(b.warnings).toEqual([w('cash_dip', 202_192), w('cash', 30_000)]);
    expect(b.state).toBe('adjust');
  });

  it('applies D-61 read literally without a path', () => {
    const a = run(BL({ scheduledOutflows: [OUT_AHEAD] }), buyCash(1_380_000));
    expect(a.cashAfter).toBe(620_000);
    expect(a.ledgerCashAfterPurchase).toBe(620_000);
    expect(a.cashAfterBillsAndPurchase).toBe(570_000);
    expect(a.warnings).toEqual([]);
    expect(a.state).toBe('fits');
    const b = run(BL({ scheduledOutflows: [OUT_PAST] }), buyCash(1_380_000));
    expect(b.cashAfter).toBe(570_000);
    expect(b.warnings).toEqual([w('cash', 30_000)]);
    expect(b.state).toBe('adjust');
  });

  it('orders a cash and a cash_dip warning with equal shortfalls cash first', () => {
    const a = run(PB(), buyCash(1_602_192));
    expect(a.warnings).toEqual([w('cash', 202_192), w('cash_dip', 202_192)]);
    expect(a.state).toBe('adjust');
  });
});

// ── Task 3: assess composition, D-31 fact, D-36 size, currency rejection, statelessness, properties ──
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
const loanCheck = (price: number, termMonths: number | null): BuyCheck =>
  buyCash(price, { payment: { method: 'loan', deposit: mu(0), termMonths, apr: ZERO_PERCENT } });
const cardCheck = (price: number): BuyCheck =>
  buyCash(price, {
    payment: {
      method: 'card',
      card: { id: 'c1', apr: null, minimumTerms: null, currency: USD },
      payoff: { kind: 'full' },
      dealerCap: null,
    },
  });
const hhScope = (rule: 'even' | 'mine') =>
  ({
    scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: rule } },
    householdSpending: { rule: { kind: 'even' }, byCategory: [] },
  }) as const;
const sizeOf = (s: DecideSnapshot, c: PurchaseCheck) => {
  const v = assess(s, c);
  if (v.state === 'missing') return v.size;
  return v.size;
};

describe('assess composition (DEC-06, D-16, D-30)', () => {
  it('returns missing with the size when only the plan is missing, and the money-basis confidence', () => {
    expect(assess(BL(), loanCheck(100_000, null))).toEqual({
      state: 'missing',
      reasons: ['loan_term_missing'],
      size: 'from_spare_this_month',
      confidence: { level: 'fair', reasons: ['under_6_full_months'] },
    });
  });

  it('returns missing without a size when there is no full month, and merges reasons context first', () => {
    expect(assess(BL({ months: [] }), buyCash(100_000))).toEqual({
      state: 'missing',
      reasons: ['no_full_month'],
      size: null,
      confidence: { level: 'rough', reasons: ['under_3_full_months'] },
    });
    expect(assess(BL({ months: [] }), loanCheck(100_000, null))).toEqual({
      state: 'missing',
      reasons: ['no_full_month', 'loan_term_missing'],
      size: null,
      confidence: { level: 'rough', reasons: ['under_3_full_months'] },
    });
  });

  it('a zero purchase split alone is missing with fair confidence, never under_3_full_months', () => {
    const s = BL({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [0, 0] } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    expect(assess(s, buyCash(100_000))).toEqual({
      state: 'missing',
      reasons: ['split_weights_zero'],
      size: null,
      confidence: { level: 'fair', reasons: ['under_6_full_months'] },
    });
  });

  it('rejects a check in another currency (D-16)', () => {
    expect(() => assess(BL(), buyCash(1_000, { currency: CAD }))).toThrow(/^assess: mixed currencies/);
  });

  it('returns a full assessment for a resolved plan', () => {
    const v = assess(BL(), buyCash(100_000));
    expect(v.state).toBe('fits');
  });
});

describe('purchase size (D-36)', () => {
  it('compares my part with this month, then with cash above the cushion', () => {
    expect(sizeOf(BL(), buyCash(125_000))).toBe('from_spare_this_month');
    expect(sizeOf(BL(), buyCash(125_001))).toBe('from_savings');
    expect(sizeOf(BL(), buyCash(1_400_000))).toBe('from_savings');
    expect(sizeOf(BL(), buyCash(1_400_001))).toBe('needs_spreading');
  });

  it('ignores the payment method', () => {
    for (const c of [loanCheck(1_400_001, 12), INST(1, { price: mu(1_400_001) }), cardCheck(1_400_001)]) {
      expect(sizeOf(BL(), c)).toBe('needs_spreading');
    }
    expect(sizeOf(BL(), loanCheck(125_000, 12))).toBe('from_spare_this_month');
  });

  it('follows the D-24 deduction without a path and cash on hand with one', () => {
    expect(sizeOf(BL({ bills: [YEARLY_DUE] }), buyCash(1_300_000))).toBe('needs_spreading');
    expect(sizeOf(BL(), buyCash(1_300_000))).toBe('from_savings');
    expect(sizeOf(PB({ bills: [YEARLY_DUE] }), buyCash(1_300_000))).toBe('from_savings');
  });

  it('follows D-61 read literally', () => {
    expect(sizeOf(BL({ scheduledOutflows: [OUT_AHEAD] }), buyCash(1_400_000))).toBe('from_savings');
    expect(sizeOf(BL({ scheduledOutflows: [OUT_PAST] }), buyCash(1_400_000))).toBe('needs_spreading');
  });

  it('uses my part of the price in a household (D-34)', () => {
    expect(ctxOf(BL(hhScope('even'))).leftBefore).toBe(275_000);
    expect(sizeOf(BL(hhScope('even')), buyCash(550_000))).toBe('from_spare_this_month');
    expect(
      sizeOf(BL({ ...hhScope('mine'), householdSpending: hhScope('mine').householdSpending }), buyCash(550_000))
    ).toBe('from_savings');
  });

  it('is never spare when this month is negative, and sizes invest checks by the amount', () => {
    const tight = BL({
      months: monthsOf(
        [
          [600_000, 700_000],
          [600_000, 700_000],
          [600_000, 700_000],
        ],
        '2026-04'
      ),
    });
    expect(ctxOf(tight).leftBefore).toBeLessThan(0);
    expect(sizeOf(tight, buyCash(0))).toBe('from_savings');
    expect(sizeOf(tight, investLump(10_000))).toBe('from_savings');
    expect(sizeOf(BL(), investLump(125_000))).toBe('from_spare_this_month');
    expect(sizeOf(BL(), investLump(125_001))).toBe('from_savings');
  });

  it('reads this month, not the worst month (D-36, D-45)', () => {
    const c = ctxOf(BL());
    expect(purchaseSize({ ...c, leftBefore: mu(-50_000) }, mu(125_000))).toBe('from_spare_this_month');
    expect(purchaseSize({ ...c, leftThisMonth: mu(100_000) }, mu(125_000))).toBe('from_savings');
  });
});

describe('D-31 basis fact', () => {
  const lump = investLump(50_000);
  it('D-31: an invest check beside a debt costing more than the projection carries the neutral fact', () => {
    const v = assess(B(), lump);
    if (v.state === 'missing') throw new Error('expected an assessment');
    expect(v.facts).toEqual([
      { code: 'debt_rate_exceeds_return', debtId: 'd1', debtApr: percent('19.9'), projectionReturn: ZERO_PERCENT },
    ]);
    const without = assess(B({ debts: [{ ...D1, apr: null }, D2] }), lump);
    if (without.state === 'missing') throw new Error('expected an assessment');
    expect(v.state).toBe(without.state);
    expect(v.warnings).toEqual(without.warnings);
  });

  it('D-31: no fact at or below the projection rate, without an APR, for secured debt or on buy checks', () => {
    const facts = (s: DecideSnapshot, c: PurchaseCheck) => {
      const v = assess(s, c);
      if (v.state === 'missing') throw new Error('expected an assessment');
      return v.facts;
    };
    expect(facts(B({ projectionReturn: percent('25') }), lump)).toEqual([]);
    expect(facts(B({ projectionReturn: percent('19.9') }), lump)).toEqual([]);
    expect(facts(B({ debts: [{ ...D1, apr: null }, D2] }), lump)).toEqual([]);
    expect(facts(B({ debts: [{ ...D2, apr: percent('30') }] }), lump)).toEqual([]);
    expect(facts(B(), buyCash(50_000))).toEqual([]);
  });
});

describe('recorded monthly investments (D-32)', () => {
  it('D-32: are paused like existing investing', () => {
    const s = R({ monthlyInvesting: mu(55_000) });
    expect(ctxOf(s).pausable).toBe(80_000);
    expect(ctxOf(s).leftBefore).toBe(110_000);
    const v = assess(s, INST(160_000));
    if (v.state === 'missing') throw new Error('expected an assessment');
    expect(v).toMatchObject({ left: -50_000, investingAtRisk: 50_000, savingAtRisk: 0, state: 'adjust' });
    expect(v.warnings).toEqual([w('inv', 50_000)]);
  });
});

describe('the split-estimate relation', () => {
  it('(D-62) newMonthly is mineMonthly plus mineRunning', () => {
    const a = run(BL(), buyCash(100_000, { runningCostsNet: mu(5_500) }));
    expect([a.mineMonthly, a.mineRunning, a.newMonthly]).toEqual([0, 5_500, 5_500]);
    expect(run(BL(), INST(120_000, { runningCostsNet: mu(-3_000) })).newMonthly).toBe(117_000);
    const c = ctxOf(BL(hhScope('even')));
    const chk = INST(120_000, { runningCostsNet: mu(5_501) });
    const h = assessPlan(c, chk, resolvePlanStrict(chk));
    expect(h.mineMonthly).toBe(60_000);
    expect(h.mineRunning).toBe(myPart(mu(5_501), c.purchaseShare));
    expect(h.newMonthly).toBe(h.mineMonthly + h.mineRunning);
    expect(run(BL(), investMonthly(10_000, 12)).mineRunning).toBe(0);
  });
});

describe('statelessness (D-30)', () => {
  it('returns the same verdict twice and never mutates the snapshot', () => {
    const s = deepFreeze(PB({ bills: [YEARLY_DUE], scheduledOutflows: [OUT_AHEAD] }));
    const c = buyCash(900_000);
    expect(assess(s, c)).toEqual(assess(s, c));
    // @ts-expect-error D-30: the engine takes no open checks
    const withOpen: DecideSnapshot = { ...snapshotOf(), openChecks: [] };
    expect(withOpen).toBeDefined();
  });
});

describe('assess properties', () => {
  const rank = { fits: 0, adjust: 1, no: 2 } as const;

  it('cash purchases: a larger price never leaves more cash or a better state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000 }), fc.integer({ min: 0, max: 4_000_000 }), (x, y) => {
        const [p1, p2] = x <= y ? [x, y] : [y, x];
        const a = assess(BL(), buyCash(p1));
        const b = assess(BL(), buyCash(p2));
        if (a.state === 'missing' || b.state === 'missing') return false;
        return a.cashAfter >= b.cashAfter && rank[a.state] <= rank[b.state];
      })
    );
  });

  it('(D-35, D-33, D-62) the pause invariant, invest rules and the split-estimate relation hold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 400_000 }),
        fc.integer({ min: -20_000, max: 20_000 }),
        fc.boolean(),
        (saving, investing, amount, running, invest) => {
          const s = R({
            monthlySaving: mu(saving),
            monthlyInvesting: mu(investing),
            limits: { ...LIMITS_BL, investingFloor: null, savingFloor: null },
          });
          const check: PurchaseCheck = invest
            ? investMonthly(amount, 12)
            : INST(amount, { runningCostsNet: mu(running) });
          const v = assess(s, check);
          if (v.state === 'missing') return false;
          const codes = v.warnings.map((x) => x.code);
          const ok62 = v.newMonthly === v.mineMonthly + v.mineRunning && (!invest || v.mineRunning === 0);
          if (invest) return ok62 && !codes.includes('inv') && !codes.includes('dsr') && !codes.includes('owe');
          if (v.cashAfter >= 0 && -v.left <= saving + investing) {
            return ok62 && v.state !== 'no' && !codes.includes('month');
          }
          return ok62;
        }
      )
    );
  });
});

describe('branch coverage helpers', () => {
  it('keeps the first of equal-APR debts when its id is smaller, and ignores a lower APR later', () => {
    const a0: DebtRecord = { ...D1, id: 'a0' };
    expect(ctxOf(B({ debts: [a0, D1, D2] })).highestUnsecuredApr?.debtId).toBe('a0');
    const low: DebtRecord = { ...D1, id: 'z9', apr: percent('3') };
    expect(ctxOf(B({ debts: [D1, low] })).highestUnsecuredApr?.debtId).toBe('d1');
  });

  it('runs the cash path for invest checks without running costs', () => {
    const lump = run(PB(), investLump(100_000));
    expect(lump.cashDip).toBeNull();
    expect(available(lump).withPurchase[0]).toBe(available(lump).withoutPurchase[0]! - 100_000);
    const monthly = run(PB(), investMonthly(50_000, 6));
    const p = available(monthly);
    expect(p.withPurchase[0]).toBe(p.withoutPurchase[0]);
    expect(p.withPurchase[90]).toBeLessThan(p.withoutPurchase[90]!);
  });
});
