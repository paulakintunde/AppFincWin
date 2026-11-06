/**
 * 05.4 D-65: the Riley-like people for the three tiers (monthShortTier.test.ts and the plain calculator's table.test.ts).
 * asOf 2026-11-15: pay 2,500 on the 1st, usual bills 1,500 and everyday 1,300, so the usual month is 300 short. This month:
 * 2,500 in, 1,500 of bills paid, 650 spent so far. A safety net with a size of 2,000, locked unless `locked: false`.
 * Test-only; synthetic.
 */
import { toEngineInputs } from '../rightAnswers/fixture';
import type { RightAnswerFixture } from '../rightAnswers/schema';

export interface TierCase {
  readonly everyday: number;
  readonly saved: number;
  readonly price: number;
  readonly locked?: false;
}

export const TIER_CASES = {
  /** $60 cash from 4,350 of spare money: Small. */
  small: { everyday: 500_000, saved: 200_000, price: 6_000 },
  /** $1,000 cash from 4,350 of spare money: Moderate. */
  moderate: { everyday: 500_000, saved: 200_000, price: 100_000 },
  /** $2,000 cash, 350 of spare money and 4,000 above the net: Moderate from extra savings. */
  moderateExtra: { everyday: 100_000, saved: 600_000, price: 200_000 },
  /** $1,500 cash that only the locked net could pay: Large (Not yet). */
  large: { everyday: 100_000, saved: 200_000, price: 150_000 },
} as const satisfies Record<string, TierCase>;

export function rileyTierFixture(o: TierCase): RightAnswerFixture {
  return {
    asOf: '2026-11-15',
    currency: 'USD',
    region: null,
    pay: { amount: 250_000, cadence: 'monthly', nextDate: '2026-12-01', setupAmount: null, lastThree: null },
    usualMonth: { bills: 150_000, everyday: 130_000, essentialEveryday: 70_000 },
    thisMonth: { received: 250_000, billsPaid: 150_000, billsDue: 0, everydaySoFar: 65_000 },
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
    check: { price: o.price, taxPercent: null, taxIncluded: null, oneOffFees: 0, pay: { mode: 'once' } },
  } as unknown as RightAnswerFixture;
}

export function rileyTier(o: TierCase): ReturnType<typeof toEngineInputs> {
  return toEngineInputs(rileyTierFixture(o));
}
