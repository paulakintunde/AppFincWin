/**
 * Near-the-line refund histories for the shadow run (05.2-31, owner decision 2). Test-only; no file is read.
 *
 * Each history is a refund history (see generateRefunds.ts) plus ONE question whose price sits just over the fit line
 * of the same history with the refund link taken off (the 05.1 behaviour). So without the link the answer is "no" or
 * "not yet" by a small margin (1 to 5 percent of the largest price that still fits). The shadow run then shows whether
 * the refund link wrongly turns that into "fits".
 *
 * The line is found by bisection on the price with the real engine, so the set is built from engine output; it is
 * deterministic (fixed seed) and cached.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { toCheckV2, toV3Inputs, type FixtureLine, type FixturePerson, type FixturePurchase } from '../golden/adapter';
import { buildPerson, type GeneratedHistory } from './generate';
import { extraArb, refundHistory } from './generateRefunds';

export const NEAR_LINE_SEED = 0x052e;
export const NEAR_LINE_COUNT = 30;
const CANDIDATES = 160;
const MAX_PRICE = 5000000;

export interface NearLineHistory extends GeneratedHistory {
  /** Largest price that fits with the refund link off. */
  readonly line: number;
  /** How far over the line the question is, in percent of the line. */
  readonly marginPct: number;
}

const question = (price: number): FixturePurchase => ({
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
  share: 'personal',
  foreign: null,
});

/** The same person with every refund link taken off (the refund stays in its own month, as before 05.2). */
export function withoutRefundLinks(person: FixturePerson): FixturePerson {
  const strip = (l: FixtureLine): FixtureLine => {
    if (l.refundOf === undefined) return l;
    const { refundOf: _unused, ...rest } = l;
    return rest;
  };
  return { ...person, months: person.months.map((m) => ({ ...m, lines: m.lines.map(strip) })) };
}

type Probe = 'fits' | 'no' | 'unready';

function probe(person: FixturePerson, price: number): Probe {
  const ev = evaluate(toV3Inputs(person), toCheckV2(question(price)));
  if (ev.result.readiness?.ready === false) return 'unready';
  return ev.result.code === 'fits_month' || ev.result.code === 'fits_unspent' ? 'fits' : 'no';
}

/** Largest price that fits, or null when the person never fits, always fits, or is not ready. */
function fitLine(person: FixturePerson): number | null {
  if (probe(person, 100) !== 'fits' || probe(person, MAX_PRICE) !== 'no') return null;
  let lo = 100;
  let hi = MAX_PRICE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const r = probe(person, mid);
    if (r === 'unready') return null;
    if (r === 'fits') lo = mid;
    else hi = mid;
  }
  return lo;
}

type Raw = Parameters<typeof buildPerson>[0];

/**
 * A healthy salaried person with a confirmed unspent figure: bills 20-40 percent of pay, everyday 25-45 percent, so a
 * fit line exists. (The 300-history base is mostly stretched or incomplete and has no line to sit near.)
 */
export const healthyArb: fc.Arbitrary<Raw> = fc
  .record({
    pay: fc.integer({ min: 300000, max: 1200000 }),
    months: fc.integer({ min: 6, max: 8 }),
    bills: fc.array(fc.record({ pct: fc.integer({ min: 5, max: 20 }), day: fc.integer({ min: 4, max: 27 }) }), { minLength: 1, maxLength: 2 }),
    everydayPct: fc.array(fc.integer({ min: 25, max: 45 }), { minLength: 8, maxLength: 8 }),
    spread: fc.integer({ min: 3, max: 8 }),
    unspentX: fc.integer({ min: 150, max: 800 }),
    emergencyMonths: fc.integer({ min: 0, max: 4 }),
  })
  .map(
    (r): Raw => ({
      freelance: false,
      months: r.months,
      pay: r.pay,
      payJitter: [],
      bills: r.bills.map((b) => ({ amount: Math.round((r.pay * b.pct) / 100), day: b.day })),
      everyday: r.everydayPct.map((p) => Math.round((r.pay * p) / 100)),
      everydaySpread: r.spread,
      oneOffs: [],
      balance: Math.round((r.pay * r.unspentX) / 100),
      unspent: { amount: Math.round((r.pay * r.unspentX) / 100) },
      staleRecords: 1,
      emergency: r.emergencyMonths === 0 ? null : r.emergencyMonths * r.pay,
      envelopes: [],
      debts: [],
      purchases: [],
    })
  );

let cache: NearLineHistory[] | null = null;

/** 30 deterministic near-the-line refund histories (seed 0x052e). */
export function generateNearLineHistories(n = NEAR_LINE_COUNT): NearLineHistory[] {
  if (cache !== null && n === NEAR_LINE_COUNT) return cache;
  const out: NearLineHistory[] = [];
  const samples = fc.sample(fc.record({ base: healthyArb, extra: extraArb, pct: fc.integer({ min: 1, max: 5 }) }), { seed: NEAR_LINE_SEED, numRuns: CANDIDATES });
  for (let i = 0; i < samples.length && out.length < n; i++) {
    const r = samples[i] as (typeof samples)[number];
    const h = refundHistory(buildPerson(r.base, i), r.extra);
    const person = { ...h.person, id: h.person.id.replace('genref-', 'gennear-') };
    const line = fitLine(withoutRefundLinks(person));
    if (line === null) continue;
    const price = line + Math.max(1, Math.round((line * r.pct) / 100));
    if (probe(withoutRefundLinks(person), price) !== 'no') continue;
    out.push({ person, purchases: [question(price)], line, marginPct: r.pct });
  }
  if (n === NEAR_LINE_COUNT) cache = out;
  return out;
}
