/**
 * Seeded synthetic histories for the shadow run (05.1-28, D-14, D-17). Test-only; no file is read.
 *
 * `historyArb` draws raw numbers; `buildPerson` turns them into a FixturePerson in the golden fixture shape, so both
 * engines read it through the same adapters. `fc.sample` with a fixed seed makes the 300 histories identical on every run.
 */
import * as fc from 'fast-check';
import type { Cadence, Envelope } from '../../types';
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

interface RawPurchase {
  price: number;
  plan: boolean;
  cadence: number;
  count: number;
  apr: number;
  today: boolean;
  deposit: number;
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
}

const purchaseArb: fc.Arbitrary<RawPurchase> = fc.record({
  price: fc.integer({ min: 1000, max: 5000000 }),
  plan: fc.boolean(),
  cadence: fc.integer({ min: 0, max: PLAN_CADENCES.length - 1 }),
  count: fc.integer({ min: 2, max: 24 }),
  apr: fc.constantFrom(0, 0, 4.9, 9.9, 19.9),
  today: fc.boolean(),
  deposit: fc.constantFrom(0, 0, 0, 5000, 20000),
  item: fc.integer({ min: 0, max: ITEM_TYPES.length - 1 }),
  tax: fc.boolean(),
});

export const historyArb: fc.Arbitrary<RawHistory> = fc.record({
  freelance: fc.boolean(),
  months: fc.integer({ min: 6, max: 8 }),
  pay: fc.integer({ min: 150000, max: 1200000 }),
  payJitter: fc.array(fc.integer({ min: 60, max: 140 }), { minLength: 8, maxLength: 8 }),
  bills: fc.array(
    fc.record({ amount: fc.integer({ min: 2000, max: 250000 }), day: fc.integer({ min: 1, max: 28 }) }),
    { minLength: 2, maxLength: 6 }
  ),
  everyday: fc.array(fc.integer({ min: 20000, max: 450000 }), { minLength: 8, maxLength: 8 }),
  everydaySpread: fc.integer({ min: 4, max: 8 }),
  oneOffs: fc.array(fc.record({ month: fc.integer({ min: 0, max: 7 }), amount: fc.integer({ min: 30000, max: 600000 }) }), {
    minLength: 0,
    maxLength: 2,
  }),
  balance: fc.integer({ min: 0, max: 3000000 }),
  unspent: fc.option(fc.record({ amount: fc.integer({ min: 0, max: 800000 }) }), { nil: null, freq: 7 }),
  staleRecords: fc.integer({ min: 0, max: 6 }),
  emergency: fc.option(fc.integer({ min: 0, max: 2000000 }), { nil: null }),
  envelopes: fc.array(
    fc.record({
      target: fc.integer({ min: 50000, max: 800000 }),
      saved: fc.integer({ min: 0, max: 300000 }),
      monthly: fc.integer({ min: 0, max: 40000 }),
    }),
    { minLength: 0, maxLength: 2 }
  ),
  debts: fc.array(
    fc.record({
      balance: fc.integer({ min: 20000, max: 2000000 }),
      minimum: fc.integer({ min: 2000, max: 60000 }),
      apr: fc.constantFrom(0, 6.5, 12.9, 21.9),
      card: fc.boolean(),
    }),
    { minLength: 0, maxLength: 2 }
  ),
  purchases: fc.array(purchaseArb, { minLength: 1, maxLength: 4 }),
});

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
        deposit: r.deposit,
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

  const person: FixturePerson = {
    id,
    currency: 'USD',
    asOf: SHADOW_AS_OF,
    months,
    series,
    profile: raw.freelance
      ? { types: ['freelance'], variable: 'steady', steady: Math.round(raw.pay * 0.7) as never, billsHorizonMonths: null }
      : { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null },
    rough: null,
    balance: raw.balance,
    unspent: raw.unspent === null ? null : { amount: raw.unspent.amount, at: SHADOW_AS_OF },
    emergency: raw.emergency,
    envelopes,
    debts,
    everydayOverride: null,
    note: 'synthetic, shadow run',
  };
  return { person, purchases: raw.purchases.map(purchaseOf) };
}

/** 300 deterministic histories (D-17): the same seed gives the same people on every machine. */
export function generateHistories(n = 300): GeneratedHistory[] {
  return fc.sample(historyArb, { seed: SHADOW_SEED, numRuns: n }).map((raw, i) => buildPerson(raw, i));
}
