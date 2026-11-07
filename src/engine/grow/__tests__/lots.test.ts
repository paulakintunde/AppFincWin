import fc from 'fast-check';
import { replayLots, type LotEntry } from '../lots';
import { minorUnits } from '../../money/types';
import { holdings } from './fixtures/ledger';

const m = minorUnits;
const e = (p: Partial<LotEntry> & Pick<LotEntry, 'kind' | 'amount'>): LotEntry => ({ units: null, localDate: '2026-01-01', ...p });
const pos = (entries: LotEntry[]) => {
  const r = replayLots(entries);
  if (!r.ok) throw new Error(r.error);
  return r.position;
};

describe('replayLots', () => {
  it('empty', () => {
    expect(pos([])).toEqual({ costBasis: 0, unitsScaled: 0n, realisedGain: 0, dividends: 0, fees: 0, putIn: 0 });
  });
  it('simple holding opening buy', () => {
    const p = pos([e({ kind: 'buy', amount: m(holdings.retirement.putIn) })]);
    expect(p.costBasis).toBe(580000);
    expect(p.putIn).toBe(580000);
  });
  it('average cost sale by units', () => {
    const p = pos([
      e({ kind: 'buy', amount: m(100000), units: '10' }),
      e({ kind: 'buy', amount: m(120000), units: '10' }),
      e({ kind: 'sell', amount: m(70000), units: '5' }),
    ]);
    expect(p.costBasis).toBe(165000);
    expect(p.realisedGain).toBe(15000);
    expect(p.unitsScaled).toBe(15n * 10n ** 8n);
  });
  it('fractional units', () => {
    const p = pos([e({ kind: 'buy', amount: m(1000), units: '0.00000001' })]);
    expect(p.unitsScaled).toBe(1n);
  });
  it('sale without units uses value before', () => {
    const p = pos([e({ kind: 'buy', amount: m(100000) }), e({ kind: 'sell', amount: m(25000), valueBefore: m(125000) })]);
    expect(p.costBasis).toBe(80000);
    expect(p.realisedGain).toBe(5000);
  });
  it('sale without units and no value before removes the amount, capped at the basis', () => {
    expect(pos([e({ kind: 'buy', amount: m(1000) }), e({ kind: 'sell', amount: m(400) })]).costBasis).toBe(600);
    expect(pos([e({ kind: 'buy', amount: m(1000) }), e({ kind: 'sell', amount: m(400), valueBefore: m(0) })]).costBasis).toBe(600);
    const p = pos([e({ kind: 'buy', amount: m(1000) }), e({ kind: 'sell', amount: m(5000) })]);
    expect(p.costBasis).toBe(0);
    expect(p.realisedGain).toBe(4000);
  });
  it('sale without units on a value smaller than the amount empties the basis', () => {
    const p = pos([e({ kind: 'buy', amount: m(1000) }), e({ kind: 'sell', amount: m(2000), valueBefore: m(1500) })]);
    expect(p.costBasis).toBe(0);
  });
  it('dividend and fee leave basis alone', () => {
    const p = pos([e({ kind: 'buy', amount: m(1000) }), e({ kind: 'dividend', amount: m(1800) }), e({ kind: 'fee', amount: m(500) })]);
    expect(p.dividends).toBe(1800);
    expect(p.fees).toBe(500);
    expect(p.costBasis).toBe(1000);
  });
  it('selling more than held units fails', () => {
    expect(replayLots([e({ kind: 'buy', amount: m(1000), units: '1' }), e({ kind: 'sell', amount: m(10), units: '2' })])).toEqual({
      ok: false,
      error: 'sell-exceeds-units',
    });
    expect(replayLots([e({ kind: 'sell', amount: m(10), units: '1' })])).toEqual({ ok: false, error: 'sell-exceeds-units' });
  });
  it('bad units text', () => {
    for (const u of ['abc', '1.123456789', '-1', '', '1e3', '1234567890123']) {
      expect(replayLots([e({ kind: 'buy', amount: m(1000), units: u })])).toEqual({ ok: false, error: 'bad-units' });
    }
  });
  it('replays by date, then entry order', () => {
    const r = pos([
      e({ kind: 'sell', amount: m(500), units: '1', localDate: '2026-02-01' }),
      e({ kind: 'buy', amount: m(1000), units: '2', localDate: '2026-01-01' }),
    ]);
    expect(r.costBasis).toBe(500);
  });
  it('same date keeps entry order', () => {
    const r = pos([e({ kind: 'buy', amount: m(1000), units: '1' }), e({ kind: 'sell', amount: m(900), units: '1' })]);
    expect(r.costBasis).toBe(0);
  });
  it('does not mutate its input', () => {
    const list = [e({ kind: 'sell', amount: m(1), localDate: '2026-02-01' }), e({ kind: 'buy', amount: m(1), localDate: '2026-01-01' })];
    replayLots(list);
    expect(list[0]!.kind).toBe('sell');
  });
  it('selling all units leaves zero basis, and gains reconcile', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100000 })), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 200000 }),
        (buys, proceeds) => {
          const entries: LotEntry[] = buys.map(([u, a]) => e({ kind: 'buy', amount: m(a), units: String(u) }));
          const total = buys.reduce((s, [u]) => s + u, 0);
          entries.push(e({ kind: 'sell', amount: m(proceeds), units: String(total), localDate: '2026-06-01' }));
          const p = pos(entries);
          expect(p.costBasis).toBe(0);
          expect(p.unitsScaled).toBe(0n);
          expect(p.realisedGain).toBe(proceeds - buys.reduce((s, [, a]) => s + a, 0));
        },
      ),
    );
  });
  it('basis is never negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), fc.integer({ min: 1, max: 100000 }), fc.integer({ min: 1, max: 200000 }), (buy, sell, v) => {
        const p = pos([e({ kind: 'buy', amount: m(buy) }), e({ kind: 'sell', amount: m(sell), valueBefore: m(v) })]);
        expect(p.costBasis).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
