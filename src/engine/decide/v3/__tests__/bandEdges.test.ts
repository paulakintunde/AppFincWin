import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { MAX_ABS_AMOUNT_MINOR, minorUnits } from '../../../money/types';
import { BAND_TABLE, homeThresholds, tidyFromUsd } from '../bandEdges';
import { BAND_EDGES_USD } from '../constants';
import { bandOf } from '../judge/bands';

describe('bandEdges', () => {
  it('D-06 examples', () => {
    expect(tidyFromUsd(20000, { num: 150n, den: 1n }, 0)).toBe(30000);
    expect(tidyFromUsd(20000, { num: 1530n, den: 1n }, 2)).toBe(30000000);
    expect(BAND_TABLE.JPY!.unspentDrift).toBe(30000);
    expect(BAND_TABLE.NGN!.unspentDrift).toBe(30000000);
  });

  it('D-07 JPY edges are tidy', () => {
    expect([...BAND_TABLE.JPY!.edges]).toEqual([
      8000, 20000, 80000, 200000, 800000, 2000000, 3000000, 8000000, 20000000, 30000000, 80000000, 200000000, 300000000, 800000000,
    ]);
  });

  it('D-07 strictly increasing per currency', () => {
    for (const [code, entry] of Object.entries(BAND_TABLE)) {
      expect(entry.edges).toHaveLength(14);
      for (let i = 1; i < entry.edges.length; i += 1) {
        expect({ code, i, up: entry.edges[i]! > entry.edges[i - 1]! }).toEqual({ code, i, up: true });
      }
      for (const e of entry.edges) expect(e).toBeLessThanOrEqual(MAX_ABS_AMOUNT_MINOR);
    }
  });

  it('D-07 USD is identity', () => {
    expect([...BAND_TABLE.USD!.edges]).toEqual([...BAND_EDGES_USD]);
    expect(BAND_TABLE.USD!.unspentDrift).toBe(20000);
    expect(BAND_TABLE.USD!.quotedTolerance).toBe(100);
  });

  it('D-07 fallback and missing', () => {
    const f = homeThresholds('XYZ', { num: 2n, den: 1n });
    expect(f.source).toBe('fallback');
    expect([...f.bandEdges]).toEqual(BAND_EDGES_USD.map((e) => tidyFromUsd(e, { num: 2n, den: 1n }, 2)));
    const m = homeThresholds('XYZ', null);
    expect(m.source).toBe('missing');
    expect(m.bandEdges).toEqual([]);
  });

  it('D-26 thresholds', () => {
    expect(BAND_TABLE.JPY!.quotedTolerance).toBe(200);
  });

  it('D-07 table never follows live rates', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), (n) => {
        const t = homeThresholds('JPY', { num: BigInt(n), den: 1n });
        expect(t.source).toBe('table');
        expect(t.bandEdges).toBe(BAND_TABLE.JPY!.edges);
      }),
      { numRuns: 50 },
    );
  });

  it('D-07 fallback strictly increasing below the clamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 1000 }), fc.constantFrom(0, 2, 3), (den, ratio, exp) => {
        // rate = num/den in 1..1000 home major per US$, so the top edge (US$5M) stays under the cap for every exponent
        const num = BigInt(den) * BigInt(ratio);
        const code = exp === 0 ? 'JPY' : exp === 3 ? 'KWD' : 'XYZ';
        const t = homeThresholds(code, { num, den: BigInt(den) });
        if (code !== 'JPY' && code !== 'KWD') expect(t.source).toBe('fallback');
        const edges = code === 'JPY' || code === 'KWD' ? BAND_EDGES_USD.map((e) => tidyFromUsd(e, { num, den: BigInt(den) }, exp)) : t.bandEdges;
        for (let i = 1; i < edges.length; i += 1) expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
      }),
      { numRuns: 150 },
    );
  });

  it('D-07 clamped edges collapse', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100000, max: 10_000_000 }), fc.integer({ min: 0, max: MAX_ABS_AMOUNT_MINOR }), (rate, whole) => {
        const t = homeThresholds('XYZ', { num: BigInt(rate), den: 1n });
        const e = t.bandEdges;
        for (let i = 1; i < e.length; i += 1) expect(e[i]!).toBeGreaterThanOrEqual(e[i - 1]!);
        const firstClamped = e.findIndex((x) => x === MAX_ABS_AMOUNT_MINOR);
        expect(firstClamped).toBeGreaterThan(-1);
        for (let i = firstClamped; i < e.length; i += 1) expect(e[i]).toBe(MAX_ABS_AMOUNT_MINOR);
        const { band } = bandOf(minorUnits(whole), t);
        const ceiling = Math.max(2, 1 + firstClamped);
        // clamped edges equal the cap, so no whole is strictly above them
        expect(band).toBeLessThanOrEqual(ceiling);
      }),
      { numRuns: 150 },
    );
  });

  it('I27 every export const carries a Cite', () => {
    const lines = readFileSync(join(__dirname, '..', 'bandEdges.ts'), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const idx = lines.map((l, i) => (/^export (const|function)/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(idx.length).toBeGreaterThanOrEqual(4);
    for (const i of idx) {
      let cited = false;
      for (let j = i - 1; j >= 0 && lines[j]!.startsWith('//'); j -= 1) if (lines[j]!.startsWith('// Cite:')) cited = true;
      expect({ line: lines[i], cited }).toEqual({ line: lines[i], cited: true });
    }
  });
});
