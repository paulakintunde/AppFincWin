import { runBacktest, FAMILIES, type Counts } from './backtest';

// Cite: D-47, owner-accepted 2026-10-26 (05.1-CONTEXT), D-40: below 50 legacy fits a family's legacy rate is too noisy to compare against.
const I28_MIN_LEGACY_FITS = 50;
// Cite: D-47, owner-accepted 2026-10-26, D-40: absolute ceiling where legacy rarely says fits, at most one false fit in four.
const I28_FAMILY_CEILING_PERCENT = 25;

const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : ((100 * a) / b).toFixed(1) + '%');

describe('I28 back-test (D-17, seeded synthetic histories)', () => {
  const result = runBacktest();

  if (process.env.SHADOW_REPORT === '1') {
    it('prints the per-family table', () => {
      const rows = FAMILIES.map((f) => {
        const c: Counts = result.byFamily[f];
        return (
          `${f.padEnd(12)} months ${String(c.months).padStart(4)}  v3 ${c.falseV3}/${c.fitsV3} (${pct(c.falseV3, c.fitsV3)})  old ${c.falseOld}/${c.fitsOld} (${pct(c.falseOld, c.fitsOld)})  ` +
          `belowLow ${c.belowLow}/${c.withLow}  notReady ${pct(c.notReady, c.evaluations)}  unexplained ${pct(c.unexplainedAsked, c.evaluations)}  ` +
          `accountAsked ${pct(c.accountAsked, c.evaluations)}  payAsked ${pct(c.payAsked, c.evaluations)}  D-48 asked ${c.asked}/${c.probes} (${pct(c.asked, c.probes)})`
        );
      });
      const o = result.overall;
      rows.push(
        `overall      v3 ${o.falseV3}/${o.fitsV3}  old ${o.falseOld}/${o.fitsOld}  belowLow ${o.belowLow}/${o.withLow} (${((100 * o.belowLow) / Math.max(1, o.withLow)).toFixed(1)}%)`
      );
      console.log(rows.join('\n'));
    });
  }

  it('I28 false fits never above legacy', () => {
    const o = result.overall;
    expect(o.fitsOld).toBeGreaterThan(0);
    // falseV3/fitsV3 <= falseOld/fitsOld by cross-multiplication; an engine with no fits has rate 0.
    if (o.fitsV3 === 0) return;
    expect(o.falseV3 * o.fitsOld).toBeLessThanOrEqual(o.falseOld * o.fitsV3);
  });

  // D-47 pass rule; D-61 (confirms D-47): on a failure the plan stops and reports the family, its rates and the gap; nothing is tuned.
  it.each(FAMILIES)('I28 per family: %s false fits never above legacy or the ceiling (D-40, D-47)', (f) => {
    const c = result.byFamily[f];
    expect(c.fitsV3).toBeGreaterThan(0); // no family passes vacuously
    if (c.fitsOld >= I28_MIN_LEGACY_FITS) {
      // v3 rate <= legacy rate, by cross-multiplication
      expect(c.falseV3 * c.fitsOld).toBeLessThanOrEqual(c.falseOld * c.fitsV3);
    } else {
      // legacy rarely says fits: the absolute ceiling applies
      expect(c.falseV3 * 100).toBeLessThanOrEqual(I28_FAMILY_CEILING_PERCENT * c.fitsV3);
    }
  });

  it('D-52: a not-ready result is never a fit', () => {
    for (const f of FAMILIES) {
      const c = result.byFamily[f];
      expect(c.evaluations).toBeGreaterThan(0);
      // fits are counted on ready answers only; a family entirely not ready is a generator defect, not a pass
      expect(c.notReady).toBeLessThan(c.evaluations);
      expect(c.fitsV3).toBeLessThanOrEqual(c.evaluations - c.notReady);
    }
  });

  it('D-48: a question is never a fit', () => {
    for (const f of FAMILIES) {
      const c = result.byFamily[f];
      expect(c.probes).toBeGreaterThan(0);
      expect(c.asked).toBeLessThanOrEqual(c.probes); // probes never enter fitsV3 / falseV3
    }
  });

  it('I28 low month calibrated', () => {
    const o = result.overall;
    expect(o.withLow).toBeGreaterThan(100);
    const share = o.belowLow / o.withLow;
    expect(share).toBeGreaterThanOrEqual(0.1);
    expect(share).toBeLessThanOrEqual(0.3);
  });
});
