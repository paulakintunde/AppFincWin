/**
 * Synthetic people for the property suites (05.4-40, ENG-19). Test helper, not a suite.
 *
 * People are built from scratch, not nudged from the golden persons. The base is the cross-check's realistic generator
 * (crosscheck/fixtureArb.ts: D-69 prices of 1-300% of pay, plans of 3 to 60 months, no routine overspending, nets, overdrafts,
 * debts, yearly bills, tax, running costs, sales and stops), read through the right-answer fixture mapping (toEngineInputs).
 * It is used as it is, so the cross-check's own draws never move. This file adds the states it does not draw:
 * - a check purpose (need, want or none, D-41 / D-110), the fact-lines switch on or off (D-50 (3)), and home-loan plans (D-39c);
 * - a low month: one recent pay more than 5% under the usual pay, with kept savings to carry it (D-81, D-82; QE-04's shape);
 * - an already-short usual month with money saved above the safety net's size (D-62, D-65; SN-23's shape), net locked or not.
 * Every draw is deterministic for a seed. Money is integer minor units.
 */
import fc from 'fast-check';
import type { CheckV2, V3Inputs } from '../../types';
import { fixtureArb } from '../crosscheck/fixtureArb';
import { toEngineInputs } from '../rightAnswers/fixture';
import type { FixtureCheck, RightAnswerFixture } from '../rightAnswers/schema';

const pct = (n: number, p: number): number => Math.floor((n * p) / 100);

type Purpose = NonNullable<FixtureCheck['purpose']>;
/** D-41 / D-110: a need (necessity, for work), a want (nice to have, treat, luxury, invest in me) or no purpose. */
const purposeArb: fc.Arbitrary<Purpose | null> = fc.constantFrom<Purpose | null>(null, null, 'necessity', 'for_work', 'nice_to_have', 'treat', 'luxury', 'invest_in_me');

interface Extras { readonly purpose: Purpose | null; readonly factLines: boolean; readonly housing: boolean }
const extrasArb: fc.Arbitrary<Extras> = fc.record({
  purpose: purposeArb,
  factLines: fc.boolean(),
  housing: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
});

function withExtras(f: RightAnswerFixture, x: Extras): RightAnswerFixture {
  const pay = f.check.pay.mode === 'plan' && x.housing ? { ...f.check.pay, housing: true } : f.check.pay;
  return { ...f, factLines: x.factLines, check: { ...f.check, pay, purpose: x.purpose } };
}

/** The usual mid-month shape both added people share: asOf 15 November, pay on the 1st, six months of records. */
function midNovember(p: {
  pay: number; bills: number; everyday: number; soFar: number; cushion: number; price: number; lean: number | null; planMonths?: number; planApr?: string;
  savings: { kept: number } | { net: { size: number; saved: number; locked: boolean } } | null;
}): RightAnswerFixture {
  const balance = p.pay - p.bills - p.soFar + p.cushion;
  const accounts: RightAnswerFixture['accounts'] = [{ id: 'a1', kind: 'checking', name: 'Everyday', balance, overdraftLimit: null, overdraftRate: null, use: 'everyday' }];
  let safetyNet: RightAnswerFixture['safetyNet'] = null;
  if (p.savings !== null && 'kept' in p.savings) {
    accounts.push({ id: 's1', kind: 'savings', name: 'Savings', balance: p.savings.kept, overdraftLimit: null, overdraftRate: null, use: null });
  } else if (p.savings !== null) {
    const n = p.savings.net;
    accounts.push({ id: 'n1', kind: 'savings', name: 'Safety net', balance: n.saved, overdraftLimit: null, overdraftRate: null, use: 'emergency' });
    safetyNet = { protect: true, size: n.size, saved: n.saved, locked: n.locked };
  }
  return {
    asOf: '2026-11-15', currency: 'USD', region: null,
    pay: {
      amount: p.pay, cadence: 'monthly', nextDate: '2026-12-01', setupAmount: null,
      lastThree: p.lean === null ? null : [p.pay, p.lean, p.pay],
      ...(p.lean === null ? {} : { lean: [{ month: '2026-09', amount: p.lean }] }),
    },
    usualMonth: { bills: p.bills, everyday: p.everyday, essentialEveryday: pct(p.everyday, 50) },
    thisMonth: { received: p.pay, billsPaid: p.bills, billsDue: 0, everydaySoFar: p.soFar },
    historyMonths: 6, quickEstimates: null, recordsAsOf: null,
    accounts, safetyNet, bills: [], debts: [], userLine: null, factLines: false,
    check: {
      price: p.price, taxPercent: null, taxIncluded: null, oneOffFees: 0,
      pay: p.planMonths === undefined ? { mode: 'once' } : { mode: 'plan', months: p.planMonths, apr: p.planApr ?? '0', fees: 0, deposit: 0, firstPaymentDate: '2026-12-15' },
    },
  };
}

/**
 * D-81 / D-82 (QE-04's shape): September's pay arrived at 40-90% of the usual pay; a kept savings account can carry it. The low-month
 * test reads a monthly payment, so half of these people check a 0% plan of 3 to 24 months (first payment 15 December).
 */
const lowMonthArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 150_000, max: 900_000 }),
    billShare: fc.integer({ min: 35, max: 55 }),
    everydayShare: fc.integer({ min: 15, max: 30 }),
    soFarShare: fc.integer({ min: 30, max: 70 }),
    leanShare: fc.integer({ min: 40, max: 90 }),
    keptShare: fc.integer({ min: 0, max: 200 }),
    priceShare: fc.integer({ min: 5, max: 120 }),
    planMonths: fc.option(fc.integer({ min: 3, max: 24 }), { nil: undefined }),
  })
  .map((r) => {
    const everyday = pct(r.pay, r.everydayShare);
    return midNovember({
      pay: r.pay, bills: pct(r.pay, r.billShare), everyday, soFar: pct(everyday, r.soFarShare), cushion: 0,
      price: Math.max(100, pct(r.pay, r.priceShare)), lean: pct(r.pay, r.leanShare), savings: { kept: pct(r.pay, r.keptShare) }, ...(r.planMonths === undefined ? {} : { planMonths: r.planMonths }),
    });
  });

/**
 * D-62 / D-65 (SN-23's shape): the usual month costs 101-120% of pay, a net at its size with money saved above it, locked or
 * unlocked, a little spare money in the everyday account, and a price of 5-120% of pay.
 */
const shortWithExtraArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 150_000, max: 900_000 }),
    costShare: fc.integer({ min: 101, max: 120 }),
    soFarShare: fc.integer({ min: 30, max: 70 }),
    cushionShare: fc.integer({ min: 0, max: 60 }),
    sizeShare: fc.integer({ min: 50, max: 120 }),
    aboveShare: fc.integer({ min: 20, max: 300 }),
    locked: fc.boolean(),
    priceShare: fc.integer({ min: 5, max: 120 }),
  })
  .map((r) => {
    const costs = pct(r.pay, r.costShare);
    const bills = pct(costs, 55);
    const everyday = costs - bills;
    const size = pct(r.pay, r.sizeShare);
    return midNovember({
      pay: r.pay, bills, everyday, soFar: pct(everyday, r.soFarShare), cushion: pct(r.pay, r.cushionShare),
      price: Math.max(100, pct(r.pay, r.priceShare)), lean: null,
      savings: { net: { size, saved: size + pct(r.pay, r.aboveShare), locked: r.locked } },
    });
  })
  .filter((f) => (f.accounts[0]?.balance ?? 0) >= 0);

/**
 * D-46 (QE-12's shape), for the runway property: a usual month that leaves 2-15% of pay, a monthly plan whose payment is more
 * than that, and 1-20 months' pay saved in earlier months in the paying account (the path pays from it), so the answer is Short each month and savings carry the gap for a while.
 * Not in the synthetic mix (it would tilt the shares); ownerRules.test.ts draws it on its own.
 */
export const shortPlanArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 150_000, max: 900_000 }),
    leftShare: fc.integer({ min: 2, max: 15 }),
    soFarShare: fc.integer({ min: 30, max: 70 }),
    keptShare: fc.integer({ min: 100, max: 2000 }),
    months: fc.integer({ min: 6, max: 48 }),
    paymentShare: fc.integer({ min: 16, max: 60 }),
    apr: fc.constantFrom('0', '9.9', '19.99'),
  })
  .map((r) => {
    const bills = pct(r.pay, 55);
    const everyday = pct(r.pay, 100 - r.leftShare) - bills;
    return midNovember({
      pay: r.pay, bills, everyday, soFar: pct(everyday, r.soFarShare), cushion: pct(r.pay, r.keptShare), lean: null,
      price: pct(r.pay, r.paymentShare) * r.months, planMonths: r.months, planApr: r.apr, savings: null,
    });
  });

/**
 * D-80 (gen:46's shape), for the short-wait property: on 25 November, a little short of the price until pay on 1 December, and an
 * expensive plan (24.9% or 29.9%) whose payment the usual month can carry. Not in the synthetic mix; ownerRules.test.ts draws it.
 */
export const shortWaitPlanArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 150_000, max: 900_000 }),
    overShare: fc.integer({ min: 1, max: 60 }),
    months: fc.integer({ min: 6, max: 24 }),
    apr: fc.constantFrom('24.9', '29.9'),
  })
  .map((r) => {
    const bills = pct(r.pay, 50);
    const everyday = pct(r.pay, 30);
    const f = midNovember({
      pay: r.pay, bills, everyday, soFar: pct(everyday, 90), cushion: 0, lean: null, savings: null,
      price: pct(r.pay, 23) + pct(r.pay, r.overShare), planMonths: r.months, planApr: r.apr,
    });
    return { ...f, asOf: '2026-11-25' };
  });

/**
 * D-39b / D-72 (DB-04's shape), for the costly-debt property: money saved in earlier months in the everyday account, a card at
 * 21.9-29.9% (balance 1-200% of pay, due on the 20th), and a price of 20-150% of pay, so some fits use earlier money while the card
 * remains, and some use so little that the interest it would save is under 1.00 a month. Not in the synthetic mix.
 */
export const costlyDebtArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 150_000, max: 900_000 }),
    cushionShare: fc.integer({ min: 0, max: 300 }),
    priceShare: fc.integer({ min: 20, max: 150 }),
    balanceShare: fc.integer({ min: 1, max: 200 }),
    apr: fc.constantFrom('21.9', '24.9', '29.9', '19.99'),
  })
  .map((r) => {
    const bills = pct(r.pay, 50);
    const everyday = pct(r.pay, 30);
    const f = midNovember({
      pay: r.pay, bills, everyday, soFar: pct(everyday, 50), cushion: pct(r.pay, r.cushionShare), lean: null, savings: null,
      price: Math.max(100, pct(r.pay, r.priceShare)),
    });
    return { ...f, debts: [{ id: 'card', kind: 'card' as const, balance: Math.max(100, pct(r.pay, r.balanceShare)), minimum: Math.max(100, pct(r.pay, 3)), apr: r.apr, dueDay: 20, joint: false }] };
  });

/** The synthetic people as right-answer fixtures (so a failing draw can be pasted into a case). */
export const syntheticFixtureArb: fc.Arbitrary<RightAnswerFixture> = fc
  .tuple(
    fc.oneof(
      { weight: 8, arbitrary: fixtureArb },
      { weight: 1, arbitrary: lowMonthArb },
      { weight: 1, arbitrary: shortWithExtraArb }
    ),
    extrasArb
  )
  .map(([f, x]) => withExtras(f, x));

/** The synthetic people as engine inputs and a check. */
export const syntheticInputsArb: fc.Arbitrary<{ readonly inputs: V3Inputs; readonly check: CheckV2; readonly fixture: RightAnswerFixture }> =
  syntheticFixtureArb.map((fixture) => ({ ...toEngineInputs(fixture), fixture }));
