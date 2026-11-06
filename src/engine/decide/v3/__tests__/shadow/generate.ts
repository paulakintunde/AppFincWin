/**
 * Seeded synthetic histories for the shadow run (05.1-28, D-14, D-17). Test-only; no file is read.
 *
 * `historyArb` draws raw numbers; `buildPerson` turns them into a FixturePerson in the golden fixture shape, so both
 * engines read it through the same adapters. `fc.sample` with a fixed seed makes the 300 histories identical on every run.
 *
 * 05.4-51 (Plan-49 re-run, owner: "the generator's deposit-bigger-than-price plans, and tune the generator to realistic people
 * (no routine 2-3x overspending)"). The draw is a share of pay (`shareHistoryArb`), resolved into amounts by `resolveShares`.
 * The distribution is binding:
 * - pay 150,000..1,200,000 a month; a freelancer's months swing 80..120% of it (the D-34 swing limit)
 * - `costShare`: what a usual month spends on bills + everyday spending + debt minimums, as a percent of pay (for a freelancer, of
 *   the steady amount they state, 70% of their average pay, which is their usual month's money in): 50..90 with
 *   weight 15 (75%), 91..105 with weight 4 (20%), 106..125 with weight 1 (5%). Nobody spends 2-3x their pay as a routine month.
 * - `billShare` 35..60% of those costs are bills, split by 2..6 weights (1..10) on days 1..28; the last bill takes the remainder
 * - debts 0..2 with a minimum of 1..6% of pay; everyday = max(10% of pay, costs - bills - debt minimums), swinging 85..115% a month
 *   (for a freelancer these shares are of the steady amount too)
 * - one-offs 0..2 of 10..60% of pay; September close 0..300% of pay; emergency fund 0..600% of pay or none; envelopes saving
 *   0..10% of pay a month
 * - a plan's deposit is 0, 5, 10 or 20% of the price, so always below it (gen:31 / gen:35 / gen:39 cannot be drawn)
 *
 * 05.4-55 (D-69, owner 2026-11-03, from the 05.4-52 review of gen:143, a $35,039 purchase on a 4-payment weekly plan for someone
 * with $1,433 a month): "the shadow generator ties price and plan length to pay: most prices fall between 1% and 300% of monthly
 * pay, with a few extremes kept; plans run 3 to 60 months." The distribution is binding:
 * - every price is a share of the usual month's money in (the same base the costs use: pay, or a freelancer's steady amount),
 *   drawn in basis points by `pricePctBpArb` (shared with the crosscheck, in ../crosscheck/fixtureArb.ts):
 *   1% to 9.99% of it 10% of the time, 10% to 49.99% 30%, 50% to 149.99% 30%, 150% to 300% 20%. So 90% of prices are 1% to 300%
 *   of a month's money in. The kept extremes: 5% are 0.1% to 0.99% of it, and 5% are above 300%, up to 1,500%.
 *   price = max($1.00, base x share), rounded down to the cent.
 * - every plan runs 3 to 60 months (`termMonthsArb`): 75% take a usual term (3, 6, 12, 18, 24, 36, 48 or 60 months), 25% any
 *   whole number of months from 3 to 60. The number of payments follows from the term and how often it is paid (`planCount`):
 *   every week term x 52 / 12, every 2 weeks term x 26 / 12 (both rounded), monthly the term, every 3 months term / 3 rounded
 *   down (at least 1).
 * - both draws sit inside the fc.noBias record, so the weights hold.
 */
import * as fc from 'fast-check';
import { buildFunds } from '../../funds/build';
import { priceOfShare, pricePctBpArb, termMonthsArb } from '../crosscheck/fixtureArb';
import { buildMonthModel } from '../../month/model';
import type { Cadence, Envelope } from '../../types';
import { toV3Inputs } from '../golden/adapter';
import type {
  FixtureDebt,
  FixtureLine,
  FixtureMonth,
  FixturePerson,
  FixturePurchase,
  FixtureSeries,
} from '../golden/adapter';

export const SHADOW_SEED = 0x051d;
export const SHADOW_AS_OF = '2026-10-03';

const MONTHS_ALL = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'] as const;

const MONTHLY: Cadence = { unit: 'month', every: 1 };

const PLAN_CADENCES: readonly Cadence[] = [
  { unit: 'week', every: 1 },
  { unit: 'week', every: 2 },
  { unit: 'month', every: 1 },
  { unit: 'month', every: 3 },
];

const ITEM_TYPES = ['general', 'electronics', 'vehicle', 'subscription', 'general', 'electronics'] as const;

/** 05.4-55 (D-69): the purchase as drawn: its price a share of pay, its plan a term in months. `resolveShares` resolves it. */
export interface SharePurchase {
  /** The price as a share of the usual month's money in, in basis points (pricePctBpArb). */
  pricePctBp: number;
  plan: boolean;
  cadence: number;
  /** The plan's term, 3..60 months (termMonthsArb). */
  termMonths: number;
  apr: number;
  today: boolean;
  depositPct: number;
  item: number;
  tax: boolean;
}

/** The resolved purchase `purchaseOf` reads. 05.4-55 (D-69): price and count are resolved from the share and the term. */
export interface RawPurchase {
  price: number;
  plan: boolean;
  cadence: number;
  count: number;
  /** 05.4-55 (D-69): the term the count came from, kept for the tests. */
  termMonths: number;
  /** 05.4-55 (D-69): the share of the base the price came from, kept for the tests. */
  pricePctBp: number;
  apr: number;
  today: boolean;
  /** 05.4-51: percent of the price (0..20), so the deposit is always below the price. */
  depositPct: number;
  item: number;
  tax: boolean;
}

interface RawHistory {
  freelance: boolean;
  months: number;
  pay: number;
  payJitter: number[];
  bills: { amount: number; day: number }[];
  everyday: number[];
  everydaySpread: number;
  oneOffs: { month: number; amount: number }[];
  balance: number;
  unspent: { amount: number } | null;
  staleRecords: number;
  emergency: number | null;
  envelopes: { target: number; saved: number; monthly: number }[];
  debts: { balance: number; minimum: number; apr: number; card: boolean }[];
  purchases: RawPurchase[];
  /** 05.4-51: the usual month's everyday spending before the monthly swing (absent for hand-built raws). */
  everydayBase?: number;
}

/** 05.4-51: the share-of-pay draw (see the header); `resolveShares` turns it into a RawHistory. All integers, minor units. */
export interface ShareHistory {
  freelance: boolean;
  months: number;
  pay: number;
  payJitter: number[];
  costShare: number;
  billShare: number;
  bills: { weight: number; day: number }[];
  everydayJitter: number[];
  everydaySpread: number;
  oneOffs: { month: number; pctOfPay: number }[];
  balancePct: number;
  unspent: { amount: number } | null;
  staleRecords: number;
  emergencyPct: number | null;
  envelopes: { target: number; saved: number; monthlyPct: number }[];
  debts: { balance: number; minimumPct: number; apr: number; card: boolean }[];
  purchases: SharePurchase[];
}

const purchaseArb: fc.Arbitrary<SharePurchase> = fc.record({
  pricePctBp: pricePctBpArb, // 05.4-55 (D-69): a share of the usual month's money in (header)
  plan: fc.boolean(),
  cadence: fc.integer({ min: 0, max: PLAN_CADENCES.length - 1 }),
  termMonths: termMonthsArb, // 05.4-55 (D-69): 3..60 months; the count follows from it (planCount)
  apr: fc.constantFrom(0, 0, 4.9, 9.9, 19.9),
  today: fc.boolean(),
  depositPct: fc.constantFrom(0, 0, 0, 5, 10, 20),
  item: fc.integer({ min: 0, max: ITEM_TYPES.length - 1 }),
  tax: fc.boolean(),
});

/** 05.4-51: the costs share of pay, weighted 75% / 20% / 5% (header). */
export const costShareArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 15, arbitrary: fc.integer({ min: 50, max: 90 }) },
  { weight: 4, arbitrary: fc.integer({ min: 91, max: 105 }) },
  { weight: 1, arbitrary: fc.integer({ min: 106, max: 125 }) }
);

// fc.noBias: drawn as stated, without fast-check's lean towards the edges of each range, so the bands keep their weights
export const shareHistoryArb: fc.Arbitrary<ShareHistory> = fc.noBias(fc.record({
  freelance: fc.boolean(),
  months: fc.integer({ min: 6, max: 8 }),
  pay: fc.integer({ min: 150000, max: 1200000 }),
  payJitter: fc.array(fc.integer({ min: 80, max: 120 }), { minLength: 8, maxLength: 8 }),
  costShare: costShareArb,
  billShare: fc.integer({ min: 35, max: 60 }),
  bills: fc.array(fc.record({ weight: fc.integer({ min: 1, max: 10 }), day: fc.integer({ min: 1, max: 28 }) }), { minLength: 2, maxLength: 6 }),
  everydayJitter: fc.array(fc.integer({ min: 85, max: 115 }), { minLength: 8, maxLength: 8 }),
  everydaySpread: fc.integer({ min: 4, max: 8 }),
  oneOffs: fc.array(fc.record({ month: fc.integer({ min: 0, max: 7 }), pctOfPay: fc.integer({ min: 10, max: 60 }) }), {
    minLength: 0,
    maxLength: 2,
  }),
  balancePct: fc.integer({ min: 0, max: 300 }),
  unspent: fc.option(fc.record({ amount: fc.integer({ min: 0, max: 800000 }) }), { nil: null, freq: 7 }),
  staleRecords: fc.integer({ min: 0, max: 6 }),
  emergencyPct: fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }),
  envelopes: fc.array(
    fc.record({
      target: fc.integer({ min: 50000, max: 800000 }),
      saved: fc.integer({ min: 0, max: 300000 }),
      monthlyPct: fc.integer({ min: 0, max: 10 }),
    }),
    { minLength: 0, maxLength: 2 }
  ),
  debts: fc.array(
    fc.record({
      balance: fc.integer({ min: 20000, max: 2000000 }),
      minimumPct: fc.integer({ min: 1, max: 6 }),
      apr: fc.constantFrom(0, 6.5, 12.9, 21.9),
      card: fc.boolean(),
    }),
    { minLength: 0, maxLength: 2 }
  ),
  purchases: fc.array(purchaseArb, { minLength: 1, maxLength: 4 }),
}));

const pct = (amount: number, p: number): number => Math.floor((amount * p) / 100);

/**
 * 05.4-55 (D-69): the number of payments a `termMonths` plan makes at PLAN_CADENCES[cadence]: every week term x 52 / 12, every 2
 * weeks term x 26 / 12 (both rounded), monthly the term, every 3 months term / 3 rounded down (at least 1).
 */
export function planCount(cadence: number, termMonths: number): number {
  const c = PLAN_CADENCES[cadence];
  if (c === undefined) throw new RangeError(`planCount: no cadence ${cadence}`);
  if (c.unit === 'week') return Math.round((termMonths * (c.every === 1 ? 52 : 26)) / 12);
  return c.every === 1 ? termMonths : Math.max(1, Math.floor(termMonths / 3));
}

/** 05.4-55 (D-69): a drawn purchase resolved against the base: price = max($1.00, base x share), count from the term. */
export function resolvePurchase(p: SharePurchase, base: number): RawPurchase {
  return {
    price: priceOfShare(base, p.pricePctBp, 100),
    plan: p.plan,
    cadence: p.cadence,
    count: planCount(p.cadence, p.termMonths),
    termMonths: p.termMonths,
    pricePctBp: p.pricePctBp,
    apr: p.apr,
    today: p.today,
    depositPct: p.depositPct,
    item: p.item,
    tax: p.tax,
  };
}

/** A freelancer states a steady amount of 70% of their average pay (05.1-28). */
export const steadyOf = (pay: number): number => Math.round(pay * 0.7);

/**
 * 05.4-51: costs = pay x costShare; debt minimums = pay x minimumPct each; bills = costs x billShare, split by the weights (the
 * last bill takes the remainder); everyday base = max(10% of pay, costs - bills - debt minimums), each month x everydayJitter.
 * 05.4-55 (D-69): each purchase's price is the same base x its share, and its count follows from its term (resolvePurchase).
 */
export function resolveShares(s: ShareHistory): RawHistory {
  // A freelancer's usual month is the steady amount they state (70% of their average pay), so their costs are a share of that.
  const base = s.freelance ? steadyOf(s.pay) : s.pay;
  const costs = pct(base, s.costShare);
  const debts = s.debts.map((d) => ({ balance: d.balance, minimum: pct(base, d.minimumPct), apr: d.apr, card: d.card }));
  const mins = debts.reduce((t, d) => t + d.minimum, 0);
  const billsTotal = pct(costs, s.billShare);
  const weightSum = s.bills.reduce((t, b) => t + b.weight, 0);
  let given = 0;
  const bills = s.bills.map((b, i) => {
    const amount = i === s.bills.length - 1 ? billsTotal - given : Math.floor((billsTotal * b.weight) / weightSum);
    given += amount;
    return { amount, day: b.day };
  });
  const everydayBase = Math.max(pct(base, 10), costs - billsTotal - mins);
  return {
    freelance: s.freelance,
    months: s.months,
    pay: s.pay,
    payJitter: s.payJitter,
    bills,
    everyday: s.everydayJitter.map((j) => pct(everydayBase, j)),
    everydaySpread: s.everydaySpread,
    oneOffs: s.oneOffs.map((o) => ({ month: o.month, amount: pct(s.pay, o.pctOfPay) })),
    balance: pct(s.pay, s.balancePct),
    unspent: s.unspent,
    staleRecords: s.staleRecords,
    emergency: s.emergencyPct === null ? null : pct(s.pay, s.emergencyPct),
    envelopes: s.envelopes.map((e) => ({ target: e.target, saved: e.saved, monthly: pct(s.pay, e.monthlyPct) })),
    debts,
    purchases: s.purchases.map((p) => resolvePurchase(p, base)),
    everydayBase,
  };
}

/** The raw histories the generators read: the share-of-pay draw, resolved (05.4-51). */
export const historyArb: fc.Arbitrary<RawHistory> = shareHistoryArb.map(resolveShares);

const pad = (n: number): string => String(n).padStart(2, '0');

function purchaseOf(r: RawPurchase): FixturePurchase {
  const item = ITEM_TYPES[r.item] as string;
  const pay: FixturePurchase['pay'] = r.plan
    ? {
        mode: 'plan',
        cadence: PLAN_CADENCES[r.cadence] as Cadence,
        count: r.count,
        termMonths: null,
        aprText: String(r.apr),
        fees: { setup: 0, perPeriod: 0, end: 0 },
        deposit: Math.floor((r.price * r.depositPct) / 100), // 05.4-51: always below the price (depositPct <= 20)
        tradeIn: 0,
        quotedPayment: null,
        firstPayment: r.today ? { kind: 'today' } : { kind: 'one_period' },
        deferredInterestTerm: false,
      }
    : { mode: 'once' };
  return {
    price: r.price,
    taxPercent: r.tax ? '8' : null,
    oneOffFees: 0,
    itemType: item,
    purpose: null,
    emergency: false,
    envelopeId: null,
    categoryId: null,
    pay,
    extras: {},
    share: 'personal',
    foreign: null,
  };
}

export interface GeneratedHistory {
  person: FixturePerson;
  purchases: FixturePurchase[];
}

export function buildPerson(raw: RawHistory, index: number): GeneratedHistory {
  const id = `gen-${String(index).padStart(3, '0')}`;
  const monthKeys = MONTHS_ALL.slice(MONTHS_ALL.length - raw.months);
  const series: FixtureSeries[] = [];
  if (!raw.freelance) {
    series.push({ id: `${id}-pay`, name: 'Pay', role: 'pay', cadence: MONTHLY, anchorDate: `${monthKeys[0]}-01`, amount: raw.pay });
  }
  raw.bills.forEach((b, i) => {
    series.push({
      id: `${id}-bill-${i}`,
      name: `Bill ${i}`,
      role: 'bill',
      cadence: MONTHLY,
      anchorDate: `${monthKeys[0]}-${pad(b.day)}`,
      amount: b.amount,
      isHousing: i === 0,
    });
  });

  const months: FixtureMonth[] = monthKeys.map((month, mi) => {
    const lines: FixtureLine[] = [];
    const jitter = (raw.payJitter[mi] ?? 100) / 100;
    if (raw.freelance) {
      lines.push({ id: `${id}-in-${mi}`, date: `${month}-${pad(5 + (mi % 10))}`, amount: Math.round(raw.pay * jitter), role: 'income' });
    } else {
      lines.push({ id: `${id}-pay-${mi}`, date: `${month}-01`, amount: raw.pay, role: 'income', seriesId: `${id}-pay` });
    }
    raw.bills.forEach((b, i) => {
      lines.push({ id: `${id}-bill-${i}-${mi}`, date: `${month}-${pad(b.day)}`, amount: b.amount, role: 'spending', seriesId: `${id}-bill-${i}` });
    });
    const total = raw.everyday[mi] ?? 100000;
    const n = raw.everydaySpread;
    const each = Math.floor(total / n);
    for (let k = 0; k < n; k++) {
      lines.push({ id: `${id}-e-${mi}-${k}`, date: `${month}-${pad(2 + k * 3)}`, amount: k === n - 1 ? total - each * (n - 1) : each, role: 'spending' });
    }
    raw.oneOffs.forEach((o, k) => {
      if (o.month % raw.months === mi) lines.push({ id: `${id}-big-${mi}-${k}`, date: `${month}-20`, amount: o.amount, role: 'spending' });
    });
    return { month, full: true, lines };
  });

  const currentLines: FixtureLine[] = [];
  // Most people have logged something in the last ten days; one in seven has not (exercises the records-look-behind rule).
  if (raw.staleRecords !== 0) {
    const avg = Math.round(raw.everyday.slice(0, raw.months).reduce((a, b) => a + b, 0) / raw.months);
    currentLines.push({ id: `${id}-e-cur`, date: '2026-10-02', amount: Math.max(100, Math.round((avg * 3) / 31)), role: 'spending' });
  }
  if (!raw.freelance) currentLines.push({ id: `${id}-pay-cur`, date: '2026-10-01', amount: raw.pay, role: 'income', seriesId: `${id}-pay` });
  raw.bills.forEach((b, i) => {
    if (b.day <= 3) currentLines.push({ id: `${id}-bill-${i}-cur`, date: `2026-10-${pad(b.day)}`, amount: b.amount, role: 'spending', seriesId: `${id}-bill-${i}` });
  });
  months.push({ month: '2026-10', full: false, lines: currentLines });

  const envelopes: Envelope[] = raw.envelopes.map((e, i) => ({
    id: `${id}-env-${i}`,
    kind: 'pot',
    target: e.target as never,
    monthlyAmount: e.monthly as never,
    readyBy: null,
    saved: e.saved as never,
    purposeId: null,
  }));
  const debts: FixtureDebt[] = raw.debts.map((d, i) => ({
    id: `${id}-debt-${i}`,
    kind: d.card ? 'card' : 'loan',
    balance: d.balance,
    minimum: d.minimum,
    aprText: String(d.apr),
    secured: !d.card,
    isHousing: false,
  }));

  // 05.4-48 (audit cause 4): balances follow from the records; no adapter clamp binds. `carried` is September's closing
  // balance in the everyday account, stated: raw.balance, raised so the first days of October (no overdraft here) never
  // push the account below 0. The account on the check date is its pots + carried + October's income - October's spending.
  const { main } = recordBalance(raw.balance, envelopes, currentLines);

  const person: FixturePerson = {
    id,
    currency: 'USD',
    asOf: SHADOW_AS_OF,
    months,
    series,
    profile: raw.freelance
      ? { types: ['freelance'], variable: 'steady', steady: steadyOf(raw.pay) as never, billsHorizonMonths: null }
      : { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null },
    rough: null,
    balance: main + (raw.emergency ?? 0),
    unspent: null,
    emergency: raw.emergency,
    envelopes,
    debts,
    everydayOverride: null,
    note: 'synthetic, shadow run',
  };
  // A confirmed unspent figure is the app's own suggested sum plus pay still to arrive (the rule in rightAnswers/fixture.ts),
  // so it never exceeds what the account holds. raw.unspent null = not confirmed; its amount is no longer read.
  if (raw.unspent !== null) person.unspent = { amount: confirmedUnspent(person), at: SHADOW_AS_OF };
  return { person, purchases: raw.purchases.map(purchaseOf) };
}

/** 05.4-48: the everyday account on the check date, from its records (pots, September's carried close, October's lines). */
export function recordBalance(
  septemberClose: number,
  envelopes: readonly { saved: unknown }[],
  currentLines: readonly FixtureLine[]
): { pots: number; octIn: number; octOut: number; carried: number; main: number } {
  const pots = envelopes.reduce((s, e) => s + Number(e.saved), 0);
  const octIn = currentLines.filter((l) => l.role === 'income').reduce((s, l) => s + l.amount, 0);
  const octOut = currentLines.filter((l) => l.role === 'spending').reduce((s, l) => s + l.amount, 0);
  const carried = Math.max(septemberClose, octOut - octIn - pots);
  return { pots, octIn, octOut, carried, main: pots + carried + octIn - octOut };
}

/** 05.4-48: the app's suggested unspent figure for this person, plus this month's pay still to arrive (never below 0 added). */
export function confirmedUnspent(person: FixturePerson): number {
  const inputs = toV3Inputs({ ...person, unspent: null });
  const mm = buildMonthModel(inputs);
  const received = person.months
    .filter((m) => m.full === false)
    .flatMap((m) => m.lines)
    .filter((l) => l.role === 'income')
    .reduce((s, l) => s + l.amount, 0);
  const toArrive = mm.moneyIn - received > 0 ? mm.moneyIn - received : 0;
  return buildFunds(inputs, mm, null).suggested + toArrive;
}

/** 300 deterministic histories (D-17): the same seed gives the same people on every machine. */
export function generateHistories(n = 300): GeneratedHistory[] {
  return fc.sample(historyArb, { seed: SHADOW_SEED, numRuns: n }).map((raw, i) => buildPerson(raw, i));
}
