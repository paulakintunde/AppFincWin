import * as fc from 'fast-check';
import type { RightAnswerFixture } from '../rightAnswers/schema';

const money = (max: number): fc.Arbitrary<number> => fc.integer({ min: 0, max });

/** Valid fixtures: monthly pay already received, one spending account, one-off or plan purchase. */
export const fixtureArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 100_000, max: 1_200_000 }),
    billsShare: fc.integer({ min: 5, max: 60 }),
    everydayShare: fc.integer({ min: 5, max: 50 }),
    paidShare: fc.constantFrom(0, 100, 100),
    soFarShare: fc.integer({ min: 20, max: 100 }),
    history: fc.integer({ min: 3, max: 6 }),
    price: fc.option(fc.integer({ min: 1, max: 2_000_000 }), { nil: null }),
    fees: fc.constantFrom(0, 0, 500, 2500),
    plan: fc.oneof({ weight: 5, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: fc.record({ months: fc.integer({ min: 2, max: 36 }), apr: fc.constantFrom(null, '0', '9.9', '19.99', '29.99'), deposit: money(50_000), fees: money(5_000) }) }),
    cushion: money(1_500_000),
  })
  .map((r): RightAnswerFixture => {
    const bills = Math.floor((r.pay * r.billsShare) / 100);
    const everyday = Math.floor((r.pay * r.everydayShare) / 100);
    const billsPaid = Math.floor((bills * r.paidShare) / 100);
    return {
      asOf: '2026-10-15', currency: 'USD', region: null,
      pay: { amount: r.pay, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
      usualMonth: { bills, everyday, essentialEveryday: Math.floor(everyday / 2) },
      thisMonth: { received: r.pay, billsPaid, billsDue: bills - billsPaid, everydaySoFar: Math.floor((everyday * r.soFarShare) / 100) },
      historyMonths: r.history, quickEstimates: null, recordsAsOf: null,
      accounts: [{ id: 'a1', kind: 'checking', name: 'Main', balance: r.cushion, overdraftLimit: null, overdraftRate: null, use: 'everyday' }],
      safetyNet: null, bills: [], debts: [], userLine: null, factLines: false,
      check: {
        price: r.price, taxPercent: null, taxIncluded: null, oneOffFees: r.fees,
        pay: r.plan === null ? { mode: 'once' } : { mode: 'plan', months: r.plan.months, apr: r.plan.apr, fees: r.plan.fees, deposit: r.plan.deposit, firstPaymentDate: '2026-11-15' },
      },
    };
  });
