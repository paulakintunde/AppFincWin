import { runBacktest, FAMILIES, type Counts } from './backtest';

describe('I28 back-test (D-17, seeded synthetic histories)', () => {
  const result = runBacktest();

  if (process.env.SHADOW_REPORT === '1') {
    it('prints the per-family table', () => {
      const rows = FAMILIES.map((f) => {
        const c: Counts = result.byFamily[f];
        return `${f.padEnd(12)} months ${String(c.months).padStart(4)}  v3 ${c.falseV3}/${c.fitsV3}  old ${c.falseOld}/${c.fitsOld}  belowLow ${c.belowLow}/${c.withLow}`;
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

  it('I28 low month calibrated', () => {
    const o = result.overall;
    expect(o.withLow).toBeGreaterThan(100);
    const share = o.belowLow / o.withLow;
    expect(share).toBeGreaterThanOrEqual(0.1);
    expect(share).toBeLessThanOrEqual(0.3);
  });
});
