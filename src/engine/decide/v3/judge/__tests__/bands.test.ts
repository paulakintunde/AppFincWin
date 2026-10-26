import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { BAND_TABLE, homeThresholds } from '../../bandEdges';
import type { Band, Layer } from '../../types';
import { BAND_LAYERS, bandOf, insteadLinkFor, layerOfAnswerKey, layersFor, stagedRequired, visibleLayerAnswers } from '../bands';

const usd = homeThresholds('USD', null);
const BANDS: readonly Band[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

describe('bands', () => {
  it('O11 band rule', () => {
    const cases: Array<[number, Band]> = [
      [4999, 1], [5000, 2], [10000, 2], [10001, 3], [50000, 3], [50001, 4], [100000, 4], [500000, 5], [500000000, 14], [500000001, 15],
    ];
    for (const [w, b] of cases) expect({ w, band: bandOf(minorUnits(w), usd).band }).toEqual({ w, band: b });
  });

  it('I29 band_rate_missing', () => {
    expect(bandOf(minorUnits(100), homeThresholds('XYZ', null))).toEqual({ band: 15, reasons: ['band_rate_missing'] });
    expect(bandOf(minorUnits(100), homeThresholds('XYZ', { num: 2n, den: 1n })).reasons).toEqual(['band_currency_fallback']);
    expect(bandOf(minorUnits(100), usd).reasons).toEqual([]);
  });

  it('I33 bands are monotone', () => {
    for (let b = 1; b < 15; b += 1) {
      for (const flags of [
        { periodic: false, hasExtras: false },
        { periodic: true, hasExtras: false },
        { periodic: false, hasExtras: true },
      ]) {
        const lo = layersFor(b as Band, flags);
        const hi = layersFor((b + 1) as Band, flags);
        expect(lo.every((l) => hi.includes(l))).toBe(true);
      }
      expect(BAND_LAYERS[b as Band].every((l) => BAND_LAYERS[(b + 1) as Band].includes(l))).toBe(true);
    }
  });

  it('I32 whole value sets the band: bandOf takes only whole and thresholds and is monotone in whole', () => {
    const codes = Object.keys(BAND_TABLE);
    expect(bandOf.length).toBe(2);
    fc.assert(
      fc.property(
        fc.constantFrom(...codes),
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        (code, a, b) => {
          const t = homeThresholds(code, null);
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(bandOf(minorUnits(lo), t).band).toBeLessThanOrEqual(bandOf(minorUnits(hi), t).band);
          expect(bandOf(minorUnits(lo), t)).toEqual(bandOf(minorUnits(lo), t));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('v3 5.2 item extras at any band', () => {
    expect(layersFor(2, { periodic: false, hasExtras: true })).toContain('L4');
    const p = layersFor(2, { periodic: true, hasExtras: false });
    expect(p).toContain('L3');
    expect(p).toContain('L5');
    expect(layersFor(1, { periodic: false, hasExtras: false })).toEqual(['L0']);
  });

  it('I43 hidden layers keep answers', () => {
    const answers = { 'L0.what': 1, 'L2.worth': 2, 'L6.closing': 3 };
    const copy = { ...answers };
    const none = { periodic: false, hasExtras: false };
    expect(visibleLayerAnswers(answers, layersFor(3, none))).toEqual({ 'L0.what': 1 });
    expect(visibleLayerAnswers(answers, layersFor(8, none))).toEqual({ 'L0.what': 1, 'L2.worth': 2 });
    expect(answers).toEqual(copy);
    // round trip 8 -> 3 -> 8 keeps every answer
    expect(visibleLayerAnswers(answers, layersFor(9, none))).toEqual(answers);
    const l: Layer = layerOfAnswerKey('L1p.x');
    expect(l).toBe('L1p');
    expect(() => layerOfAnswerKey('zzz')).toThrow(RangeError);
  });

  it('instead link and staged', () => {
    expect(insteadLinkFor(1)).toBe('none');
    for (const b of [2, 3, 4] as Band[]) expect(insteadLinkFor(b)).toBe('link');
    expect(insteadLinkFor(5)).toBe('prominent');
    for (const b of BANDS.filter((x) => x >= 6)) expect(insteadLinkFor(b)).toBe('open');
    expect(BANDS.filter(stagedRequired)).toEqual([15]);
  });
});
