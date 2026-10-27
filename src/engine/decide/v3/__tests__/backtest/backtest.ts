/**
 * I28 back-test (05.1-29, D-17). Rolling origin over seeded synthetic histories in seven persona families.
 *
 * At each origin month the person is cut off at the 3rd of that month, a price ladder is judged by v3 (evaluate) and by
 * today's engine (oldAnswer, 'month' basis), and the held-out month's true leftover says whether a "fits" was false.
 * Test-only. Synthetic data only (T-05.1-61): nothing here reads a real person or a real log.
 *
 * D-40: variable earners state their pattern, carry 24-30 months, and their pay series is the latest logged pay. No figure
 * is tuned to a band.
 * D-52: each origin carries the held-out month's own lines dated on or before the cut-off as the current, not-full month,
 * the way a user who keeps records current would, so a well-kept record is ready. Identical for every family.
 * D-50: each origin's unspent anchor is the engine's own suggested figure at the cut-off (the user confirms the app's sum),
 * so a well-kept record has no unexplained money. Identical for every family.
 * D-54: persons are built through toV3Inputs, so every account states a use by the adapter rule (05.1-35); no account
 * with an unstated use is added.
 */
import * as fc from 'fast-check';
import type { IncomeProfile } from '../../types';
import { addYearMonths } from '../../dates';
import { evaluate } from '../../evaluate';
import { buildMonthModel } from '../../month/model';
import { toCheckV2, toV3Inputs, type FixtureLine, type FixtureMonth, type FixturePerson, type FixturePurchase, type FixtureSeries } from '../golden/adapter';
import { oldAnswer } from '../golden/toOld';

export const SEED = 0x0128;
export const HISTORIES_PER_FAMILY = 20;
export const LADDER_PCT: readonly number[] = [10, 55, 100, 150, 200];
export const LARGE_MONTH_SPEND = 15_000_000;

export type Family = 'salaried' | 'gig' | 'seasonal' | 'partial' | 'couple' | 'new_user' | 'large_month';
export const FAMILIES: readonly Family[] = ['salaried', 'gig', 'seasonal', 'partial', 'couple', 'new_user', 'large_month'];

interface Spec {
  readonly pay: number;
  readonly rentPct: number;
  readonly utilsPct: number;
  readonly savePct: number;
  readonly everydayPct: number;
  readonly n: number;
  readonly bigMonth: number;
  readonly noise: readonly number[];
}

const specArb: fc.Arbitrary<Spec> = fc.record({
  pay: fc.integer({ min: 250_000, max: 900_000 }),
  rentPct: fc.integer({ min: 25, max: 40 }),
  utilsPct: fc.integer({ min: 4, max: 8 }),
  savePct: fc.integer({ min: 3, max: 12 }),
  everydayPct: fc.integer({ min: 18, max: 34 }),
  n: fc.integer({ min: 12, max: 18 }),
  bigMonth: fc.integer({ min: 0, max: 17 }),
  noise: fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 600, maxLength: 600 }),
});

/** A synthetic person plus the true leftover of every month (what the user really had, logged or not). */
export interface History {
  readonly family: Family;
  readonly index: number;
  readonly person: FixturePerson;
  readonly truth: readonly { readonly month: string; readonly left: number }[];
  readonly share: FixturePurchase['share'];
}

const BASE = '2025-01';

function build(family: Family, index: number, s: Spec): History {
  let k = 0;
  const draw = (): number => (s.noise[k++ % s.noise.length] ?? 0) / 10_000; // 0..1
  const spread = (centre: number, pct: number): number => Math.round(centre * (1 + ((draw() * 2 - 1) * pct) / 100));
  const variable = family === 'gig' || family === 'seasonal';
  const n = family === 'new_user' ? 4 : variable ? s.n + 12 : s.n; // D-40: 24..30 months for variable earners
  const pay = family === 'couple' ? s.pay + Math.round(s.pay * 0.7) : s.pay;
  const rent = Math.round((pay * s.rentPct) / 100);
  const utils = Math.round((pay * s.utilsPct) / 100);
  const save = Math.round((pay * s.savePct) / 100);
  const everydayBase = Math.round((pay * s.everydayPct) / 100);
  const id = `bt-${family}-${index}`;
  const series: FixtureSeries[] = [
    { id: `${id}-rent`, name: 'Rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: `${BASE}-01`, amount: rent, isHousing: true },
    { id: `${id}-utils`, name: 'Utilities', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: `${BASE}-15`, amount: utils },
    { id: `${id}-save`, name: 'Saving', role: 'saving', cadence: { unit: 'month', every: 1 }, anchorDate: `${BASE}-05`, amount: save, savingMode: 'fixed' },
  ];
  const months: FixtureMonth[] = [];
  const truth: { month: string; left: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ym = addYearMonths(BASE, i);
    const calMonth = Number(ym.slice(5, 7));
    const lines: FixtureLine[] = [];
    let income = pay;
    let everyday = spread(everydayBase, 10);
    if (family === 'gig') income = Math.round(pay * (0.45 + draw() * 1.1));
    if (family === 'seasonal') {
      const summer = [5, 6, 7, 8, 9].includes(calMonth);
      income = Math.round(pay * (summer ? 1.45 : 0.7) * (0.92 + draw() * 0.16));
      if (calMonth === 12) everyday = Math.round(everyday * 1.6);
    }
    if (family === 'couple') everyday = Math.round(everyday * 1.4);
    let loggedEveryday = everyday;
    if (family === 'partial' && draw() < 0.25) loggedEveryday = Math.round(everyday * (0.3 + draw() * 0.4));
    let big = 0;
    if (family === 'large_month' && i === s.bigMonth % n) big = LARGE_MONTH_SPEND;

    lines.push({ id: `${id}-pay-${i}`, date: `${ym}-01`, amount: income, role: 'income', seriesId: `${id}-pay` });
    lines.push({ id: `${id}-rent-${i}`, date: `${ym}-01`, amount: rent, role: 'spending', seriesId: `${id}-rent` });
    lines.push({ id: `${id}-utils-${i}`, date: `${ym}-15`, amount: utils, role: 'spending', seriesId: `${id}-utils` });
    lines.push({ id: `${id}-save-${i}`, date: `${ym}-05`, amount: save, role: 'saved_invested', seriesId: `${id}-save` });
    const lineCount = 4;
    const each = Math.floor(loggedEveryday / lineCount);
    for (let e = 0; e < lineCount; e++) {
      const amt = e === lineCount - 1 ? loggedEveryday - each * (lineCount - 1) : each;
      lines.push({ id: `${id}-e-${i}-${e}`, date: `${ym}-${String(3 + e * 6).padStart(2, '0')}`, amount: amt, role: 'spending' });
    }
    if (big > 0) lines.push({ id: `${id}-big-${i}`, date: `${ym}-20`, amount: big, role: 'spending' });
    months.push({ month: ym, full: true, mark: null, lines });
    truth.push({ month: ym, left: income - rent - utils - save - everyday - big });
  }
  // D-40: the pay series amount is the latest logged pay (the snapshot's latestAmount rule).
  const lastIncome = months[months.length - 1]?.lines.find((l) => l.role === 'income')?.amount ?? pay;
  series.unshift({ id: `${id}-pay`, name: 'Pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: `${BASE}-01`, amount: variable ? lastIncome : pay });
  const profile: IncomeProfile | null =
    family === 'gig'
      ? { types: ['freelance'], variable: 'match', steady: null, billsHorizonMonths: null, pattern: 'variable' }
      : family === 'seasonal'
        ? { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'seasonal' }
        : null;
  const person: FixturePerson = {
    id,
    currency: 'USD',
    asOf: `${addYearMonths(BASE, n)}-03`,
    months,
    series,
    profile,
    rough: null,
    balance: pay * 3,
    unspent: null,
    emergency: pay * 2,
    envelopes: [],
    debts: [],
    everydayOverride: null,
    note: `I28 synthetic ${family} #${index}`,
  };
  return { family, index, person, truth, share: family === 'couple' ? { kind: 'household', members: 2, rule: 'even' } : 'personal' };
}

/** 20 seeded histories per family. Same seed, same set. */
export function histories(): readonly History[] {
  const out: History[] = [];
  FAMILIES.forEach((family, f) => {
    const specs = fc.sample(specArb, { numRuns: HISTORIES_PER_FAMILY, seed: SEED + f });
    specs.forEach((s, i) => out.push(build(family, i, s)));
  });
  return out;
}

/**
 * The person as of the 3rd of month `origin`. D-52: the held-out month's own lines dated on or before the cut-off are
 * carried as the current, not-full month. D-50: the unspent anchor is the engine's own suggested figure at the cut-off.
 */
export function heldOut(h: History, origin: number): { person: FixturePerson; actualLeft: number } {
  const cur = h.person.months[origin];
  const month = cur?.month ?? '';
  const at = `${month}-03`;
  const prior = h.person.months.slice(0, origin);
  const months: FixtureMonth[] = [...prior, { month, full: false, mark: null, lines: (cur?.lines ?? []).filter((l) => l.date <= at) }];
  const bare: FixturePerson = { ...h.person, asOf: at, months, unspent: null };
  const suggested = Number(evaluate(toV3Inputs(bare), toCheckV2(purchaseOf(1000, h.share))).funds.suggested);
  return {
    person: { ...bare, unspent: { amount: suggested, at } },
    actualLeft: h.truth[origin]?.left ?? 0,
  };
}

export function originsOf(h: History): number[] {
  const first = h.family === 'new_user' ? 3 : h.family === 'gig' || h.family === 'seasonal' ? 12 : 7;
  const out: number[] = [];
  for (let o = first; o <= h.person.months.length - 1; o++) out.push(o);
  return out;
}

export interface Counts {
  fitsV3: number;
  falseV3: number;
  fitsOld: number;
  falseOld: number;
  months: number;
  belowLow: number;
  withLow: number;
  evaluations: number;
  notReady: number;
  unexplainedAsked: number;
  accountAsked: number;
  payAsked: number;
  probes: number;
  asked: number;
}
const zero = (): Counts => ({ fitsV3: 0, falseV3: 0, fitsOld: 0, falseOld: 0, months: 0, belowLow: 0, withLow: 0, evaluations: 0, notReady: 0, unexplainedAsked: 0, accountAsked: 0, payAsked: 0, probes: 0, asked: 0 });

function purchaseOf(price: number, share: FixturePurchase['share']): FixturePurchase {
  return {
    price,
    taxPercent: null,
    oneOffFees: 0,
    itemType: 'general',
    purpose: null,
    emergency: false,
    envelopeId: null,
    categoryId: null,
    pay: { mode: 'once' },
    extras: {},
    share,
    foreign: null,
  };
}

export function runBacktest(): { overall: Counts; byFamily: Record<Family, Counts> } {
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, zero()])) as Record<Family, Counts>;
  for (const h of histories()) {
    const c = byFamily[h.family];
    for (const origin of originsOf(h)) {
      const { person, actualLeft } = heldOut(h, origin);
      const inputs = toV3Inputs(person);
      const probe = { month: buildMonthModel(inputs) };
      const low = probe.month.low;
      const typical = probe.month.typicalLeft;
      c.months += 1;
      if (low !== null) {
        c.withLow += 1;
        if (actualLeft < Number(low.left)) c.belowLow += 1;
      }
      const base = Math.max(1000, typical === null ? 0 : Number(typical));
      for (const pct of LADDER_PCT) {
        const price = Math.max(1000, Math.round((base * pct) / 100));
        const mine = h.share === 'personal' ? price : Math.ceil(price / 2);
        const purchase = purchaseOf(price, h.share);
        const ev = evaluate(inputs, toCheckV2(purchase));
        const code = ev.result.code;
        c.evaluations += 1;
        if (ev.result.readiness?.ready === false) c.notReady += 1;
        if (ev.result.missing.includes('unexplained_money_question')) c.unexplainedAsked += 1;
        if (ev.result.missing.includes('account_use_question')) c.accountAsked += 1;
        if (ev.result.missing.includes('pay_arrival_question')) c.payAsked += 1;
        // D-52: a not-ready result is never a fits, so it can never be a false fit.
        const ready = ev.result.readiness?.ready !== false;
        if (ready && (code === 'fits_month' || code === 'fits_unspent')) {
          c.fitsV3 += 1;
          const unspent = code === 'fits_unspent' ? Number(ev.funds.unspent?.value ?? 0) : 0;
          if (actualLeft + unspent - mine < 0) c.falseV3 += 1;
        }
        const old = oldAnswer(person, purchase, 'month');
        if (old.state === 'fits') {
          c.fitsOld += 1;
          if (actualLeft - mine < 0) c.falseOld += 1;
        }
      }
      // D-48: a question is not a fits; asking is reported, not gated. One 12-month monthly plan at 50% of the base.
      const payment = Math.round(base / 2);
      const planPurchase: FixturePurchase = {
        ...purchaseOf(payment * 12, h.share),
        pay: {
          mode: 'plan',
          cadence: { unit: 'month', every: 1 },
          count: 12,
          termMonths: null,
          aprText: '0',
          fees: { setup: 0, perPeriod: 0, end: 0 },
          deposit: 0,
          tradeIn: 0,
          quotedPayment: null,
          firstPayment: { kind: 'one_period' },
          deferredInterestTerm: false,
        },
      };
      const planEv = evaluate(inputs, toCheckV2(planPurchase));
      c.probes += 1;
      if (planEv.result.missing.includes('volatile_cover_question')) c.asked += 1;
    }
  }
  const overall = zero();
  for (const c of Object.values(byFamily)) for (const key of Object.keys(overall) as (keyof Counts)[]) overall[key] += c[key];
  return { overall, byFamily };
}
