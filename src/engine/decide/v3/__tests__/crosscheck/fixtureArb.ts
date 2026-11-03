import * as fc from 'fast-check';
import type { RightAnswerFixture } from '../rightAnswers/schema';

const money = (max: number): fc.Arbitrary<number> => fc.integer({ min: 0, max });

/**
 * 05.4-55 (D-69, owner 2026-11-03, from the 05.4-52 review of gen:143): "the shadow generator ties price and plan length to pay:
 * most prices fall between 1% and 300% of monthly pay, with a few extremes kept; plans run 3 to 60 months." Shared by the shadow
 * generator (shadow/generate.ts imports these two) and the crosscheck below, so both draw prices and plans the same way. They
 * live here because this file may import nothing from the engine (QA-03), while generate.ts may import from here.
 *
 * pricePctBpArb: the price as a share of the usual month's money in, in basis points (1 bp = 0.01%). 18 of 20 draws (90%) are
 * 1% to 300% of it: 1-9.99% (weight 2), 10-49.99% (6), 50-149.99% (6), 150-300% (4). The kept extremes are 1 of 20 (5%) at
 * 0.1-0.99% and 1 of 20 (5%) above 300%, up to 1,500%. Draw it inside fc.noBias so the weights hold.
 */
export const pricePctBpArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 100, max: 999 }) },
  { weight: 6, arbitrary: fc.integer({ min: 1000, max: 4999 }) },
  { weight: 6, arbitrary: fc.integer({ min: 5000, max: 14999 }) },
  { weight: 4, arbitrary: fc.integer({ min: 15000, max: 30000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 10, max: 99 }) },
  { weight: 1, arbitrary: fc.integer({ min: 30001, max: 150000 }) }
);

/** 05.4-55 (D-69): a plan's term, 3 to 60 months. 3 in 4 draws take a usual term (3, 6, 12, 18, 24, 36, 48 or 60), 1 in 4 any month count. */
export const termMonthsArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(3, 6, 12, 18, 24, 36, 48, 60) },
  { weight: 1, arbitrary: fc.integer({ min: 3, max: 60 }) }
);

/** 05.4-55 (D-69): the price for a share of pay in basis points, never below `floor`. */
export const priceOfShare = (pay: number, bp: number, floor: number): number => Math.max(floor, Math.floor((pay * bp) / 10000));

/**
 * 05.4-51 (Plan-49 re-run): what a usual month spends on bills + everyday spending, as a percent of pay, drawn as the shadow
 * generator draws it: 50..90 (75%), 91..105 (20%), 106..125 (5%). Nobody spends 2-3x their pay as a routine month.
 */
const costShareArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 15, arbitrary: fc.integer({ min: 50, max: 90 }) },
  { weight: 4, arbitrary: fc.integer({ min: 91, max: 105 }) },
  { weight: 1, arbitrary: fc.integer({ min: 106, max: 125 }) }
);
/** 05.4-51: the share of those costs that is bills (the rest is everyday spending). */
const billShareArb: fc.Arbitrary<number> = fc.integer({ min: 35, max: 60 });

/** 05.4-51 (Plan-49 re-run): bills = pay x costShare x billShare; everyday = pay x costShare - bills. */
function usualCosts(pay: number, costShare: number, billShare: number): { bills: number; everyday: number } {
  const bills = Math.floor((pay * costShare * billShare) / 10000);
  return { bills, everyday: Math.floor((pay * costShare) / 100) - bills };
}

interface MidMonthRaw {
  pay: number; costShare: number; billShare: number; paidShare: number; soFarShare: number; history: number;
  /** 05.4-55 (D-69): the price as a share of pay in basis points (pricePctBpArb); null = no price entered. */
  price: number | null; fees: number;
  plan: { months: number; apr: string | null; depositPct: number; fees: number; firstPaymentDate: string } | null;
  cushion: number;
  /** 05.4-51 (D-58, D-67): a regular saving from the everyday account, as a percent of pay, on its day; null = none. */
  saving: { pct: number; day: number } | null;
}

const midMonthRawArb: fc.Arbitrary<MidMonthRaw> = fc.record({
  pay: fc.integer({ min: 100_000, max: 1_200_000 }),
  costShare: costShareArb,
  billShare: billShareArb,
  paidShare: fc.constantFrom(0, 100, 100),
  soFarShare: fc.integer({ min: 20, max: 100 }),
  history: fc.integer({ min: 3, max: 6 }),
  price: fc.option(pricePctBpArb, { nil: null }), // 05.4-55 (D-69): a share of pay in basis points, resolved in midMonth
  fees: fc.constantFrom(0, 0, 500, 2500),
  plan: fc.oneof({ weight: 5, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: fc.record({ months: termMonthsArb, apr: fc.constantFrom(null, '0', '9.9', '19.99', '29.99'), depositPct: fc.constantFrom(0, 0, 5, 10, 20), fees: money(5_000), firstPaymentDate: fc.constantFrom('2026-10-15', '2026-11-15') }) }), // 05.4-51 (Plan-49 re-run): the deposit is a share of the price. 05.4-55 (D-69): 3..60 months; the first payment today (asOf) or on 15 November, so a short plan can end inside the 90 days (D-68)
  cushion: money(1_500_000),
  saving: fc.option(fc.record({ pct: fc.integer({ min: 1, max: 15 }), day: fc.integer({ min: 1, max: 28 }) }), { nil: null, freq: 3 }),
});

/**
 * 05.4-48 (audit cause 4): the mid-month account balance follows from its records. `cushion` is the money carried from earlier
 * months; the balance is that plus this month's money received, less the bills paid and the everyday spending so far.
 */
function midMonth(r: MidMonthRaw, received: number): RightAnswerFixture {
  const price = r.price === null ? null : priceOfShare(r.pay, r.price, 1); // 05.4-55 (D-69)
  const { bills, everyday } = usualCosts(r.pay, r.costShare, r.billShare);
  const billsPaid = Math.floor((bills * r.paidShare) / 100);
  const everydaySoFar = Math.floor((everyday * r.soFarShare) / 100);
  // D-58 / D-67: this month's saving has left the account when its day is on or before the 15th (it is logged on its day).
  const saving = r.saving === null ? undefined : { amount: Math.max(1, Math.floor((r.pay * r.saving.pct) / 100)), day: r.saving.day, movedThisMonth: r.saving.day <= 15 };
  const balance = r.cushion + received - billsPaid - everydaySoFar - (saving?.movedThisMonth === true ? saving.amount : 0);
  return {
    asOf: '2026-10-15', currency: 'USD', region: null,
    pay: { amount: r.pay, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
    usualMonth: { bills, everyday, essentialEveryday: Math.floor(everyday / 2), ...(saving === undefined ? {} : { saving }) },
    thisMonth: { received, billsPaid, billsDue: bills - billsPaid, everydaySoFar },
    historyMonths: r.history, quickEstimates: null, recordsAsOf: null,
    accounts: [{ id: 'a1', kind: 'checking', name: 'Main', balance, overdraftLimit: null, overdraftRate: null, use: 'everyday' }],
    safetyNet: null, bills: [], debts: [], userLine: null, factLines: false,
    check: {
      price, taxPercent: null, taxIncluded: null, oneOffFees: r.fees,
      // 05.4-51 (Plan-49 re-run): the deposit is always below the price (0 with no price)
      pay: r.plan === null ? { mode: 'once' } : { mode: 'plan', months: r.plan.months, apr: r.plan.apr, fees: r.plan.fees, deposit: Math.floor(((price ?? 0) * r.plan.depositPct) / 100), firstPaymentDate: r.plan.firstPaymentDate },
    },
  };
}

/** A possible person has no account below 0 without an overdraft (the overdraft fixture below states its negative carry). */
const possible = (f: RightAnswerFixture): boolean => (f.accounts[0]?.balance ?? 0) >= 0;

/** Valid fixtures: monthly pay already received, one spending account, one-off or plan purchase. */
const midMonthArb: fc.Arbitrary<RightAnswerFixture> = midMonthRawArb.map((r) => midMonth(r, r.pay)).filter(possible);

/**
 * 05.4-48 (D-52): a freelancer with no pay series. Each history month's income is the stated pay x 80..120%, paid on one day of
 * the month; this month's pay is either in (on the 1st) or not yet. The usual month reads the stated steady amount. 80..120%
 * keeps the months steady-but-irregular: their spread stays under the D-34 swing limit (22%), above which both sides first ask
 * to confirm the pattern.
 */
const irregularArb: fc.Arbitrary<RightAnswerFixture> = fc
  .tuple(midMonthRawArb, fc.array(fc.integer({ min: 80, max: 120 }), { minLength: 6, maxLength: 6 }), fc.integer({ min: 1, max: 28 }), fc.boolean())
  .map(([r, shares, day, paid]) => {
    const f = midMonth(r, paid ? r.pay : 0);
    const amounts = shares.slice(0, r.history).map((x) => Math.floor((r.pay * x) / 100));
    return { ...f, pay: { ...f.pay, irregular: { amounts, day } } };
  })
  .filter(possible);

/**
 * 05.4-15 (ENG-14, QE-07): the 1st of a month with nothing recorded yet, last month full and the records synced 0 to 6
 * days ago. Pay and bills fall due today. Fresh records (0 to 3 days) answer as a usual month; older records keep the
 * usual rules, so only purchases from band 5 up are drawn for them (they ask for more records first on both sides).
 */
const firstOfMonthArb: fc.Arbitrary<RightAnswerFixture> = fc
  .record({
    pay: fc.integer({ min: 100_000, max: 1_200_000 }),
    costShare: costShareArb, // 05.4-51 (Plan-49 re-run)
    billShare: billShareArb,
    history: fc.integer({ min: 3, max: 6 }),
    price: pricePctBpArb, // 05.4-55 (D-69): a share of pay in basis points
    fees: fc.constantFrom(0, 0, 500, 2500),
    cushion: money(1_500_000),
    syncedDaysAgo: fc.integer({ min: 0, max: 6 }),
  })
  .map((r): RightAnswerFixture => {
    const { bills, everyday } = usualCosts(r.pay, r.costShare, r.billShare);
    const recordsAsOf = new Date(Date.UTC(2026, 10, 1 - r.syncedDaysAgo)).toISOString().slice(0, 10);
    const share = priceOfShare(r.pay, r.price, 1); // 05.4-55 (D-69)
    const price = r.syncedDaysAgo > 3 ? Math.max(share, 100_001) : share;
    return {
      asOf: '2026-11-01', currency: 'USD', region: null,
      pay: { amount: r.pay, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
      usualMonth: { bills, everyday, essentialEveryday: Math.floor(everyday / 2) },
      thisMonth: { received: 0, billsPaid: 0, billsDue: 0, everydaySoFar: 0 },
      historyMonths: r.history, quickEstimates: null, recordsAsOf,
      accounts: [{ id: 'a1', kind: 'checking', name: 'Main', balance: r.cushion, overdraftLimit: null, overdraftRate: null, use: 'everyday' }],
      safetyNet: null, bills: [], debts: [], userLine: null, factLines: false,
      check: { price, taxPercent: null, taxIncluded: null, oneOffFees: r.fees, pay: { mode: 'once' } },
    };
  });

/**
 * 05.4-17 (FIN-03): the mid-month fixture with its account lowered, possibly below 0, and an overdraft limit and rate on it
 * (or none set), so Uses your overdraft, past the limit and no limit set are all drawn. The drop is a stated negative carry
 * from earlier months, inside or past the limit (05.4-48).
 */
const overdraftArb: fc.Arbitrary<RightAnswerFixture> = fc
  .tuple(midMonthArb, fc.option(money(1_500_000), { nil: null }), fc.constantFrom(null, '0', '19.9', '39.9'), money(2_000_000))
  .map(([f, limit, rate, drop]) => ({
    ...f,
    accounts: f.accounts.map((a) => ({ ...a, balance: a.balance - drop, overdraftLimit: limit, overdraftRate: rate })),
  }));

/**
 * 05.4-18 (FIN-01, FIN-02): a safety-net record on any of the fixtures above, with its money in a savings account marked as the
 * net: protection on or off, a size (null = the starter, 0 = off) and money saved, so no net, a small one, a full one and one
 * above its size are all drawn.
 */
const netArb: fc.Arbitrary<RightAnswerFixture> = fc
  .tuple(fc.oneof(midMonthArb, firstOfMonthArb, overdraftArb), fc.boolean(), fc.option(fc.oneof(fc.constant(0), money(1_500_000)), { nil: null }), money(2_000_000), fc.boolean())
  .map(([f, protect, size, saved, locked]) => ({
    ...f,
    accounts: [...f.accounts, { id: 'n1', kind: 'savings' as const, name: 'Safety net', balance: saved, overdraftLimit: null, overdraftRate: null, use: 'emergency' as const }],
    // 05.4-48 (D-61): locked (the default) or unlocked in Decide settings.
    safetyNet: { protect, size, saved, locked },
  }));

export const fixtureArb: fc.Arbitrary<RightAnswerFixture> = fc.oneof(
  { weight: 5, arbitrary: midMonthArb },
  { weight: 1, arbitrary: firstOfMonthArb },
  { weight: 3, arbitrary: overdraftArb },
  { weight: 3, arbitrary: netArb },
  { weight: 1, arbitrary: irregularArb }
);
