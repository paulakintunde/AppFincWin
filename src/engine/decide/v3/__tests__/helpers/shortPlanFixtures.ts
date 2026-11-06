/**
 * 05.4 D-68: hand-worked people for "a short plan paid from money on hand" (shortPlan.test.ts, the copy corpus and, from
 * 05.4-54, the plain calculator's table.test.ts). Test-only; synthetic.
 *
 * The person (asOf 2026-11-15): pay 3,000 on the 1st; usual bills 1,500 and everyday spending 1,000, so the usual month leaves
 * 500. This month: 3,000 in, 1,500 of bills paid, 500 spent so far, so 500 of everyday spending is still to come this month.
 * A safety net with a size of 2,000 in its own savings account, locked unless `locked: false`.
 *
 * Plans are 0% with no deposit and no fees. The 90-day cash path runs 2026-11-15 .. 2027-02-12 (day 90 = 2027-02-13).
 *
 * Engine-side first payment: toEngineInputs maps a plan's first payment as a deferral and asks the pause question (05.4-51,
 * BR-16 note). Here, as in BR-16's table.test pin, a first payment dated asOf is read as 'today' and one a period later as
 * 'one_period' on the engine side, so the plan is built without the question.
 */
import { minorUnits } from '../../../../money/types';
import type { CheckV2, FirstPayment, V3Inputs } from '../../types';
import { toEngineInputs } from '../rightAnswers/fixture';
import type { RightAnswerFixture } from '../rightAnswers/schema';

export interface ShortPlanCase {
  /** The Everyday account's balance. */
  readonly everyday: number;
  /** Saved in the safety net's account (its size is 2,000). */
  readonly saved: number;
  /** The whole price; the plan is `months` equal payments of price / months. */
  readonly price: number;
  readonly months: number;
  readonly every?: 'fortnight';
  /** First payment today (default) or one period out. */
  readonly first?: 'today' | 'one_period';
  /** A first payment on this date instead (no interest during the pause): the day-90 edge. */
  readonly firstOn?: string;
  readonly locked?: false;
  /** Usual bills and everyday spending, when not 1,500 and 1,000. */
  readonly bills?: number;
  readonly spend?: number;
  /** The plan's APR as text; 0% when absent. */
  readonly apr?: string;
  /** A monthly running cost (insurance), in minor units. */
  readonly running?: number;
}

export const SHORT_PLAN_CASES = {
  /** 1,800 laptop, 3 x 600 monthly from today (15 Nov, 15 Dec, 15 Jan): inside the 90 days; 600 > 500 a month. */
  qualifies: { everyday: 400_000, saved: 200_000, price: 180_000, months: 3 },
  /** The same 1,800 over 6 x 300 (last 15 Apr): 300 <= 500, so the monthly part fits. */
  longFits: { everyday: 400_000, saved: 200_000, price: 180_000, months: 6 },
  /** 3,600 over 6 x 600 (last 15 Apr, past day 90): Short each month as before (QE-12 rule). */
  longShort: { everyday: 400_000, saved: 200_000, price: 360_000, months: 6 },
  /** Everyday 500, the 3 x 600 plan: the path goes below 0 today. */
  pathBelow: { everyday: 50_000, saved: 200_000, price: 180_000, months: 3 },
  /** Everyday 1,000, net 2,000 of 2,000 locked, 3 x 900: only the net could carry the path. */
  lockedNet: { everyday: 100_000, saved: 200_000, price: 270_000, months: 3 },
  /** The same, unlocked: the net would carry it, and D-68 never uses net money. */
  unlockedNet: { everyday: 100_000, saved: 200_000, price: 270_000, months: 3, locked: false },
  /** Everyday 500, 6,000 saved against a 2,000 size (4,000 extra savings), the 3 x 600 plan. */
  extraSavings: { everyday: 50_000, saved: 600_000, price: 180_000, months: 3 },
  /** The qualifying plan with a 20 a month running cost: the cost runs past the window. */
  running: { everyday: 400_000, saved: 200_000, price: 180_000, months: 3, running: 2_000 },
  /** Bills 1,600 and everyday 1,500 (usual month 100 short), Everyday 4,000, the 3 x 600 plan. */
  alreadyShort: { everyday: 400_000, saved: 200_000, price: 180_000, months: 3, bills: 160_000, spend: 150_000 },
  /** 1,800 in 4 x 450 every 2 weeks from today (the BR-12 shape): 15 Nov .. 27 Dec. */
  fortnight: { everyday: 400_000, saved: 200_000, price: 180_000, months: 4, every: 'fortnight' },
} as const satisfies Record<string, ShortPlanCase>;

export function shortPlanFixture(o: ShortPlanCase): RightAnswerFixture {
  const bills = o.bills ?? 150_000;
  const spend = o.spend ?? 100_000;
  const days = o.every === 'fortnight' ? 14 : 0;
  const firstDate = o.firstOn ?? (o.first === 'one_period' ? (days > 0 ? '2026-11-29' : '2026-12-15') : '2026-11-15');
  return {
    asOf: '2026-11-15',
    currency: 'USD',
    region: null,
    pay: { amount: 300_000, cadence: 'monthly', nextDate: '2026-12-01', setupAmount: null, lastThree: null },
    usualMonth: { bills, everyday: spend, essentialEveryday: Math.round(spend / 2) },
    thisMonth: { received: 300_000, billsPaid: bills, billsDue: 0, everydaySoFar: Math.round(spend / 2) },
    historyMonths: 6,
    quickEstimates: null,
    recordsAsOf: null,
    accounts: [
      { id: 'a1', kind: 'checking', name: 'Everyday', balance: o.everyday, overdraftLimit: null, overdraftRate: null, use: 'everyday' },
      { id: 'n1', kind: 'savings', name: 'Safety net', balance: o.saved, overdraftLimit: null, overdraftRate: null, use: 'emergency' },
    ],
    safetyNet: { protect: true, size: 200_000, saved: o.saved, ...(o.locked === false ? { locked: false } : {}) },
    bills: [],
    debts: [],
    userLine: null,
    factLines: true,
    check: {
      price: o.price,
      taxPercent: null,
      taxIncluded: null,
      oneOffFees: 0,
      pay: { mode: 'plan', months: o.months, apr: o.apr ?? '0', fees: 0, deposit: 0, firstPaymentDate: firstDate, ...(o.every === undefined ? {} : { every: o.every }) },
    },
  } as unknown as RightAnswerFixture;
}

/** The engine inputs, with the first payment read as today / one period out (no pause question) and any running cost. */
export function shortPlan(o: ShortPlanCase): { inputs: V3Inputs; check: CheckV2 } {
  const { inputs, check } = toEngineInputs(shortPlanFixture(o));
  const firstPayment: FirstPayment =
    o.firstOn !== undefined
      ? { kind: 'deferred', firstDate: o.firstOn, interestDuringPause: false }
      : o.first === 'one_period'
        ? { kind: 'one_period' }
        : { kind: 'today' };
  const pay = check.pay.mode === 'plan' ? { ...check.pay, firstPayment } : check.pay;
  const extras = o.running === undefined ? check.extras : { ...check.extras, insurance_monthly: minorUnits(o.running) };
  return { inputs, check: { ...check, pay, extras } };
}
