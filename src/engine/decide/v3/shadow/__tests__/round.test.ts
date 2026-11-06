// 05.4-36 BO-08 (D-10, D-145, T-05.4-36-01): what one shadow answer sends.
import { minorUnits } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import { loadPersons, toV3Inputs } from '../../__tests__/golden/adapter';
import type { Fact, FactCode, ReasonCode, Result } from '../../types';
import { isPrivateKey, roundForShadow, roundSig2, SHADOW_CODES_MAX, SHADOW_FIGURES_CHARS, SHADOW_FIGURES_MAX } from '../round';
import { shadowSamples } from '../samples';

const person = loadPersons()[0];
if (person === undefined) throw new Error('no golden person');
const inputs = toV3Inputs(person);
const sample = shadowSamples(inputs.currency)[1];
if (sample === undefined) throw new Error('no sample');
const base: Result = evaluate(inputs, sample.check).result;
const ASOF = '2026-10-10';

const fact = (code: string, values: Record<string, number | string | null>): Fact => ({ code: code as FactCode, values });

describe('roundSig2', () => {
  it.each([
    [62743, 63000],
    [-1234, -1200],
    [1250, 1300],
    [-1250, -1300],
    [99, 99],
    [-7, -7],
    [100, 100],
    [9_007_199_254_740_991, 9_000_000_000_000_000],
    [1.234, 1.2],
  ])('%p -> %p', (v, out) => {
    expect(roundSig2(v)).toBe(out);
  });

  it('0 and -0 give 0, never -0', () => {
    expect(Object.is(roundSig2(0), 0)).toBe(true);
    expect(Object.is(roundSig2(-0), 0)).toBe(true);
  });
});

describe('isPrivateKey', () => {
  it.each(['accountId', 'account_id', 'name', 'categoryId', 'f.account', 'debt.ids', 'seriesId', 'envelopeId', 'Names'])('%s is private', (k) => {
    expect(isPrivateKey(k)).toBe(true);
  });
  it.each(['paid', 'middle', 'amount', 'month_left_after.left', 'provided', 'counted'])('%s is not', (k) => {
    expect(isPrivateKey(k)).toBe(false);
  });
});

describe('roundForShadow', () => {
  it('keeps the code and variant', () => {
    const r = roundForShadow({ ...base, code: 'fits_unspent', variant: 'extra_savings' }, ASOF);
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('extra_savings');
  });

  it('prefixes codes by list in the order m, d, r, f, c, n and removes repeats', () => {
    const r = roundForShadow(
      {
        ...base,
        missing: ['no_price'],
        readiness: { ready: false, missing: ['past_month_missing'] },
        reasons: ['pay_gap'],
        facts: [fact('net_used', {}), fact('net_used', {})],
        caveats: [{ code: 'few_months', values: {} }],
        notices: [{ code: 'pay_gap', values: {} }],
      },
      ASOF
    );
    expect(r.reasons).toEqual(['m:no_price', 'd:past_month_missing', 'r:pay_gap', 'f:net_used', 'c:few_months', 'n:pay_gap']);
    expect(r.figures.cut).toBe(0);
    expect(r.figures.ready).toBe(0);
  });

  it('a result with 15 reason and fact codes sends exactly 12, reasons first, and counts the 3 cut', () => {
    const reasons = ['pay_gap', 'records_synced', 'quick_estimates_used', 'tax_not_included', 'lean_months_used'] as ReasonCode[];
    const facts = Array.from({ length: 10 }, (_, i) => fact(`fact_${i}`, {}));
    const r = roundForShadow({ ...base, missing: [], readiness: { ready: true, missing: [] }, reasons, facts, caveats: [], notices: [] }, ASOF);
    expect(r.reasons).toHaveLength(SHADOW_CODES_MAX);
    expect(r.reasons.slice(0, 5)).toEqual(reasons.map((c) => `r:${c}`));
    expect(r.reasons[11]).toBe('f:fact_6');
    expect(r.figures.cut).toBe(3);
    expect(r.figures.ready).toBe(1);
  });

  it('a result without caveats sends the other codes', () => {
    const r = roundForShadow({ ...base, missing: [], readiness: undefined, reasons: [], facts: [fact('net_used', {})], caveats: undefined, notices: [] }, ASOF);
    expect(r.reasons).toEqual(['f:net_used']);
  });

  it('rounds the after-buy figures and sums the split by source', () => {
    const r = roundForShadow(
      {
        ...base,
        afterBuy: { ...base.afterBuy, month: minorUnits(62743), usualMonth: minorUnits(-1234), before: minorUnits(99) },
        split: [
          { source: 'month', amount: minorUnits(40000) },
          { source: 'extra_savings', amount: minorUnits(12345) },
          { source: 'month', amount: minorUnits(2743) },
        ],
        band: 7,
        readyBy: { kind: 'date', date: '2027-02-14' },
        readiness: undefined,
        facts: [],
      },
      ASOF
    );
    expect(r.figures).toEqual({ am: 63000, aum: -1200, ab: 99, 's.month': 43000, 's.extra_savings': 12000, band: 7, rbm: 4, ready: 1, cut: expect.any(Number) });
  });

  it('leaves out a null usual month, a null band and no ready-by date; a ready-by month counts months from asOf', () => {
    const r = roundForShadow({ ...base, afterBuy: { ...base.afterBuy, usualMonth: null }, band: null, readyBy: { kind: 'month', month: '2026-10' }, split: [], facts: [] }, ASOF);
    expect(r.figures).not.toHaveProperty('aum');
    expect(r.figures).not.toHaveProperty('band');
    expect(r.figures.rbm).toBe(0);
    const none = roundForShadow({ ...base, readyBy: null, facts: [] }, ASOF);
    expect(none.figures).not.toHaveProperty('rbm');
  });

  it('sends fact numbers rounded, and drops strings, nulls, non-finite numbers and private keys (D-10)', () => {
    const r = roundForShadow(
      {
        ...base,
        facts: [
          fact('month_left_after', { month: '2026-10', left: 62743 }),
          fact('free_help', { country: 'GB', name: 'MoneyHelper' }),
          fact('other_account_overdrawn', { amount: 5000 }),
          fact('envelope_used', { envelopeId: 'e1', amount: 1234, accountId: 'a1', categoryId: 'c1' }),
          fact('net_lasts', { months: Number.POSITIVE_INFINITY, amount: null }),
          fact('month_left_after', { left: 1 }),
        ],
      },
      ASOF
    );
    expect(r.figures['month_left_after.left']).toBe(63000);
    expect(r.figures['envelope_used.amount']).toBe(1200);
    for (const [k, v] of Object.entries(r.figures)) {
      expect(typeof v).toBe('number');
      expect(roundSig2(v)).toBe(v);
      expect(isPrivateKey(k)).toBe(false);
    }
    expect(Object.keys(r.figures).some((k) => k.startsWith('free_help') || k.startsWith('net_lasts') || k.startsWith('other_account'))).toBe(false);
  });

  it('stops at 24 figures', () => {
    const facts = Array.from({ length: 40 }, (_, i) => fact(`f${i}`, { a: i * 1000 + 7 }));
    const r = roundForShadow({ ...base, facts }, ASOF);
    expect(Object.keys(r.figures)).toHaveLength(SHADOW_FIGURES_MAX);
    expect(JSON.stringify(r.figures).length).toBeLessThanOrEqual(SHADOW_FIGURES_CHARS);
  });

  it('stops before the JSON passes its character budget with long keys', () => {
    const long = 'x'.repeat(80);
    const facts = Array.from({ length: 20 }, (_, i) => fact(`${long}${i}`, { amount: 123456789 }));
    const r = roundForShadow({ ...base, facts }, ASOF);
    expect(Object.keys(r.figures).length).toBeLessThan(SHADOW_FIGURES_MAX);
    expect(JSON.stringify(r.figures).length).toBeLessThanOrEqual(SHADOW_FIGURES_CHARS);
  });

  it('every invented person and sample gives a row within the table limits and no private key', () => {
    for (const p of loadPersons()) {
      const ins = toV3Inputs(p);
      for (const s of shadowSamples(ins.currency)) {
        const r = roundForShadow(evaluate(ins, s.check).result, ins.asOf);
        expect(r.reasons.length).toBeLessThanOrEqual(SHADOW_CODES_MAX);
        expect(JSON.stringify(r.figures).length).toBeLessThanOrEqual(SHADOW_FIGURES_CHARS);
        expect(Object.keys(r.figures).filter(isPrivateKey)).toEqual([]);
      }
    }
  });
});
