/**
 * Seeded refund- and bucket-bearing synthetic histories for the shadow run (05.2-31, D-11). Test-only; no file is read.
 *
 * A separate generator from `generate.ts` (whose 300 histories stay exactly as they were). Each history is a base history
 * from `historyArb` plus: one purchase with a linked refund (full, partial, over, several, or a payment-plan purchase),
 * and a regular saving series with saving buckets alongside it. The fixed seed makes the 40 histories identical on every run.
 */
import * as fc from 'fast-check';
import type { Envelope } from '../../types';
import type { FixtureLine, FixturePerson, FixtureSeries } from '../golden/adapter';
import { buildPerson, historyArb, type GeneratedHistory } from './generate';

export const REFUND_SEED = 0x052d;
export const REFUND_HISTORY_COUNT = 40;

export const REFUND_KINDS = ['full', 'partial', 'over', 'several', 'plan'] as const;
type RefundKind = (typeof REFUND_KINDS)[number];

interface RawExtra {
  kind: number;
  purchaseMonth: number;
  refundGap: number;
  purchase: number;
  partialPct: number;
  buckets: { saved: number; target: number; monthly: number }[];
  saving: number;
  savingFixed: boolean;
}

const extraArb: fc.Arbitrary<RawExtra> = fc.record({
  kind: fc.integer({ min: 0, max: REFUND_KINDS.length - 1 }),
  purchaseMonth: fc.integer({ min: 0, max: 3 }),
  refundGap: fc.integer({ min: 1, max: 3 }),
  purchase: fc.integer({ min: 20000, max: 900000 }),
  partialPct: fc.integer({ min: 10, max: 90 }),
  buckets: fc.array(
    fc.record({
      saved: fc.integer({ min: 0, max: 300000 }),
      target: fc.integer({ min: 100000, max: 900000 }),
      monthly: fc.integer({ min: 1000, max: 60000 }),
    }),
    { minLength: 1, maxLength: 3 }
  ),
  saving: fc.integer({ min: 5000, max: 120000 }),
  savingFixed: fc.boolean(),
});

const pad = (n: number): string => String(n).padStart(2, '0');

function refundHistory(base: GeneratedHistory, x: RawExtra): GeneratedHistory {
  const p = base.person;
  const id = p.id.replace('gen-', 'genref-');
  const kind: RefundKind = REFUND_KINDS[x.kind] ?? 'full';
  const full = p.months.filter((m) => m.full === true);
  const pIdx = Math.min(x.purchaseMonth, full.length - 2);
  const purchaseId = `${id}-buy`;
  const purchaseDate = (full[pIdx]?.month ?? '2026-02') + '-12';
  const refundMonthIdx = Math.min(pIdx + x.refundGap, full.length - 1);
  const refundMonth = full[refundMonthIdx]?.month ?? '2026-09';
  const refundLine = (suffix: string, amount: number, day: number): FixtureLine => ({
    id: `${id}-ref-${suffix}`,
    date: `${refundMonth}-${pad(day)}`,
    amount,
    role: 'refund',
    refundOf: purchaseId,
  });

  const savingSeries: FixtureSeries = {
    id: `${id}-save`,
    name: 'Saving',
    role: 'saving',
    cadence: { unit: 'month', every: 1 },
    anchorDate: `${full[0]?.month ?? '2026-02'}-03`,
    amount: x.saving,
    savingMode: x.savingFixed ? 'fixed' : 'flexible',
  };

  const months = p.months.map((m, mi) => {
    const lines: FixtureLine[] = [...m.lines];
    if (mi === pIdx) lines.push({ id: purchaseId, date: purchaseDate, amount: x.purchase, role: 'spending', name: 'Refundable purchase' });
    if (kind === 'plan' && mi === pIdx) {
      // a payment-plan purchase: the day-one payment is the purchase line; later instalments are a debt payment series
      lines.push({ id: `${id}-inst-${mi}`, date: `${m.month}-20`, amount: Math.round(x.purchase / 6), role: 'debt_payment', seriesId: `${id}-plan` });
    }
    if (mi === refundMonthIdx) {
      if (kind === 'full' || kind === 'plan') lines.push(refundLine('a', x.purchase, 8));
      if (kind === 'partial') lines.push(refundLine('a', Math.max(1, Math.round((x.purchase * x.partialPct) / 100)), 8));
      if (kind === 'over') lines.push(refundLine('a', x.purchase + Math.round(x.purchase / 4), 8));
      if (kind === 'several') {
        const third = Math.max(1, Math.round(x.purchase / 3));
        lines.push(refundLine('a', third, 6), refundLine('b', third, 9), refundLine('c', third + 1, 14));
      }
    }
    if (m.full === true && x.saving > 0) lines.push({ id: `${id}-save-${mi}`, date: `${m.month}-03`, amount: x.saving, role: 'saved_invested', seriesId: savingSeries.id });
    return { ...m, lines };
  });

  const series: FixtureSeries[] = [...p.series, savingSeries];
  if (kind === 'plan') {
    series.push({
      id: `${id}-plan`,
      name: 'Plan instalment',
      role: 'debt_payment',
      cadence: { unit: 'month', every: 1 },
      anchorDate: `${full[pIdx]?.month ?? '2026-02'}-20`,
      amount: Math.round(x.purchase / 6),
    });
  }

  const buckets: Envelope[] = x.buckets.map((b, i) => ({
    id: `${id}-bucket-${i}`,
    kind: 'pot',
    target: b.target as never,
    monthlyAmount: b.monthly as never,
    readyBy: null,
    saved: b.saved as never,
    purposeId: null,
    bucket: true,
  }));

  const person: FixturePerson = { ...p, id, months, series, envelopes: [...p.envelopes, ...buckets], note: 'synthetic, refund and bucket shadow run' };
  return { person, purchases: base.purchases };
}

/** 40 deterministic refund- and bucket-bearing histories (seed 0x052d). */
export function generateRefundHistories(n = REFUND_HISTORY_COUNT): GeneratedHistory[] {
  return fc
    .sample(fc.record({ base: historyArb, extra: extraArb }), { seed: REFUND_SEED, numRuns: n })
    .map((r, i) => refundHistory(buildPerson(r.base, i), r.extra));
}
