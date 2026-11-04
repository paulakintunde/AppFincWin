/**
 * 05.4-24 (FIN-09, ENG-05, UX-02; D-22, D-23, D-24, D-44): the one after-purchase block. Hand-pinned on approved right-answer cases
 * (their situations state the figures) and on the pure helpers in afterBuy.ts.
 */
import { minorUnits } from '../../../money/types';
import { SOLE_SHARE } from '../../share';
import { afterBuyBlock, firstPaymentLater, homeFigure, laterThisMonth, monthAfterPlans, rebased } from '../afterBuy';
import { evaluate } from '../evaluate';
import { judgeCheck, prepare } from '../prepare';
import type { AfterBuy, Purchase, Schedule } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const mu = minorUnits;
const CASES = loadCases();
const run = (id: string) => {
  const c = CASES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no case ${id}`);
  const { inputs, check } = toEngineInputs(c.fixture);
  return evaluate(inputs, check);
};
const factsOf = (id: string, code: string) => run(id).result.facts.filter((f) => f.code === code).map((f) => f.values);

describe('FIN-09 the big figure on approved cases', () => {
  it('QE-08 a one-off: this month after its plans less the purchase, $1,000 - $975 = $25 (D-22)', () => {
    const ab = run('QE-08').result.afterBuy;
    expect(ab).toEqual({ lead: 'month', month: 2_500, usualMonth: null, before: 100_000, monthName: '2026-11' });
  });

  it('QE-09 pay due on the 27th counts in the month figure ($800 - $600 = $200); the cash path still says Not yet until that payday (D-23)', () => {
    const e = run('QE-09');
    expect([e.result.code, e.result.variant, e.result.readyBy]).toEqual(['not_yet', 'payday', { kind: 'date', date: '2026-11-27' }]);
    expect(e.result.afterBuy).toMatchObject({ lead: 'month', month: 20_000, before: 80_000 });
  });

  it('QE-10 a plan leads with the usual month once payments start: $1,000 - $500 = $500', () => {
    const ab = run('QE-10').result.afterBuy;
    expect([ab.lead, ab.usualMonth]).toEqual(['usualMonth', 50_000]);
  });

  it('OD-04 a Not yet one-off still shows the month figure: $750 - $600 = $150', () => {
    expect(run('OD-04').result.afterBuy.month).toBe(15_000);
  });

  it('BR-06 a plan loses its payment due later this month (28 November): $300 - $100 = $200 by the month figure', () => {
    // The approved case states -$300, the account at month end (the October overdraft carried); that basis is an owner question.
    expect(run('BR-06').result.afterBuy).toMatchObject({ month: 20_000, usualMonth: 20_000, before: 30_000 });
  });

  it('SN-11 money from earlier months: this month gives its £800 and the £2,150 from earlier is named, still in the account (D-44)', () => {
    const e = run('SN-11');
    expect([e.result.code, e.result.variant]).toEqual(['fits_unspent', 'tight']);
    expect(e.result.afterBuy).toMatchObject({ lead: 'month', month: 0, before: 80_000 });
    expect(factsOf('SN-11', 'earlier_money_from')).toEqual([{ amount: 215_000, where: 'account' }]);
    // the tight figure is D-75's money really left: £3,000 free - £2,950 = £50, under the £170 floor
    expect(factsOf('SN-11', 'tight_floor')).toEqual([{ floor: 17_000, basis: 'tenth' }]);
  });

  it('SN-13 extra savings are named as savings: $300 from November and $200 above the net size (D-44, D-62)', () => {
    expect(run('SN-13').result.afterBuy.month).toBe(0);
    expect(factsOf('SN-13', 'earlier_money_from')).toEqual([{ amount: 20_000, where: 'savings' }]);
  });

  it('DB-04 the £1,050 saved from earlier months is named; the month gives its £750', () => {
    expect(run('DB-04').result.afterBuy.month).toBe(0);
    expect(factsOf('DB-04', 'earlier_money_from')).toEqual([{ amount: 105_000, where: 'account' }]);
  });

  it('BR-17 a short plan judged by cash (D-68) leads with this month, and its split already holds every payment', () => {
    const e = run('BR-17');
    expect(e.result.afterBuy).toMatchObject({ lead: 'month', month: 0, usualMonth: -10_000 });
    expect(e.result.reasons).not.toContain('first_payment_later');
  });

  it('BR-01 a plan whose first payment falls after this month says so, and its month figure holds no payment', () => {
    const e = run('BR-01');
    expect(e.result.reasons).toContain('first_payment_later');
    expect(e.result.afterBuy.month).toBe(e.result.afterBuy.before);
  });

  it('the month_left_after fact says the same figure as afterBuy.month', () => {
    for (const id of ['QE-08', 'SN-11', 'SN-03', 'OD-01', 'BR-17']) {
      const e = run(id);
      const left = e.result.facts.find((f) => f.code === 'month_left_after')?.values['left'];
      expect({ id, left }).toEqual({ id, left: e.result.afterBuy.month });
    }
  });

  it('an ask with no price yet carries the month as it stands', () => {
    const c = CASES.find((x) => x.id === 'QE-08')!;
    const { inputs, check } = toEngineInputs(c.fixture);
    const e = judgeCheck(prepare(inputs), { ...check, price: null } as never);
    expect(e.result.code).toBe('needs_input');
    expect(e.result.afterBuy).toEqual({ lead: 'month', month: 100_000, usualMonth: null, before: 100_000, monthName: '2026-11' });
  });
});

const SCHEDULE = { firstDate: '2026-11-28', cadence: { unit: 'month', every: 1 }, lastPaying: 3, payment: mu(10_000), finalPayment: mu(10_000), fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) } } as unknown as Schedule;
const PERSONAL = SOLE_SHARE;
const purchaseOf = (over: Partial<Purchase>): Purchase => ({ dayOne: mu(0), monthly: mu(0), runningMonthly: mu(0), schedule: null, share: PERSONAL, ...over }) as Purchase;

describe('afterBuy.ts helpers', () => {
  it('monthAfterPlans is the month model own figure', () => {
    expect(monthAfterPlans({ monthLeft: mu(-1) })).toBe(-1);
  });

  it('homeFigure is the lower of the readings, whichever comes first; a Prepared has at least one reading', () => {
    expect(homeFigure({ readings: [{ month: { monthLeft: mu(70_000) } }, { month: { monthLeft: mu(-200_000) } }] })).toBe(-200_000);
    expect(homeFigure({ readings: [{ month: { monthLeft: mu(-5) } }, { month: { monthLeft: mu(10) } }] })).toBe(-5);
    expect(() => homeFigure({ readings: [] })).toThrow(RangeError);
  });

  it('laterThisMonth counts the payments after today and before next month; none without a schedule', () => {
    expect(laterThisMonth(purchaseOf({ schedule: SCHEDULE }), '2026-11-15', '2026-11')).toBe(10_000);
    expect(laterThisMonth(purchaseOf({ schedule: SCHEDULE }), '2026-11-28', '2026-11')).toBe(0); // today's payment is in day one
    expect(laterThisMonth(purchaseOf({}), '2026-11-15', '2026-11')).toBe(0);
  });

  it('firstPaymentLater: only a plan whose first payment is on or after the first of next month', () => {
    expect(firstPaymentLater(purchaseOf({ schedule: SCHEDULE }), '2026-11')).toBe(false);
    expect(firstPaymentLater(purchaseOf({ schedule: { ...SCHEDULE, firstDate: '2026-12-01' } }), '2026-11')).toBe(true);
    expect(firstPaymentLater(purchaseOf({}), '2026-11')).toBe(false);
  });

  it('afterBuyBlock: no price, a one-off, a split, a plan, a plan judged by cash, a running cost and an unknown usual month', () => {
    const month = { month: '2026-11', monthLeft: mu(30_000), typicalLeft: mu(25_000) };
    const at = { month, asOf: '2026-11-15', byCash: false, fromThisMonth: null };
    expect(afterBuyBlock({ ...at, purchase: null })).toEqual({ lead: 'month', month: 30_000, usualMonth: null, before: 30_000, monthName: '2026-11' });
    expect(afterBuyBlock({ ...at, purchase: purchaseOf({ dayOne: mu(5_000) }) })).toMatchObject({ lead: 'month', month: 25_000, usualMonth: null });
    expect(afterBuyBlock({ ...at, purchase: purchaseOf({ dayOne: mu(5_000) }), fromThisMonth: mu(2_000) }).month).toBe(28_000);
    const plan = purchaseOf({ schedule: SCHEDULE, monthly: mu(10_000) });
    expect(afterBuyBlock({ ...at, purchase: plan })).toEqual({ lead: 'usualMonth', month: 20_000, usualMonth: 15_000, before: 30_000, monthName: '2026-11' });
    expect(afterBuyBlock({ ...at, purchase: plan, byCash: true, fromThisMonth: mu(30_000) })).toMatchObject({ lead: 'month', month: 0, usualMonth: 15_000 });
    expect(afterBuyBlock({ ...at, purchase: purchaseOf({ monthly: mu(4_000), runningMonthly: mu(4_000) }) }).usualMonth).toBe(21_000);
    expect(afterBuyBlock({ ...at, month: { ...month, typicalLeft: null }, purchase: plan }).usualMonth).toBeNull();
  });

  it('rebased keeps what the purchase takes this month and moves the start to Home', () => {
    const ab: AfterBuy = { lead: 'month', month: mu(66_500), usualMonth: null, before: mu(70_000), monthName: '2026-11' };
    expect(rebased(ab, mu(70_000))).toBe(ab);
    expect(rebased(ab, mu(-200_000))).toEqual({ ...ab, before: -200_000, month: -203_500 });
  });
});
