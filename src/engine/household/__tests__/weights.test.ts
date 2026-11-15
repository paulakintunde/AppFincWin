import fc from 'fast-check';
import { evenWeights, rebalanceWeights } from '../weights';

describe('rebalanceWeights', () => {
  it('two members: the other takes the rest', () => {
    expect(rebalanceWeights([50, 50], 0, 70)).toEqual({ ok: true, weights: [70, 30] });
  });

  it('scales the others proportionally', () => {
    expect(rebalanceWeights([40, 30, 30], 0, 60)).toEqual({ ok: true, weights: [60, 20, 20] });
  });

  it('keeps a 0% member at 0 while others have weight', () => {
    expect(rebalanceWeights([50, 50, 0], 0, 80)).toEqual({ ok: true, weights: [80, 20, 0] });
  });

  it('spreads evenly when all others are 0', () => {
    expect(rebalanceWeights([100, 0, 0], 0, 40)).toEqual({ ok: true, weights: [40, 30, 30] });
  });

  it('setting the index to 100 zeroes the others', () => {
    expect(rebalanceWeights([50, 50], 1, 100)).toEqual({ ok: true, weights: [0, 100] });
  });

  it('refuses to zero the last positive weight', () => {
    expect(rebalanceWeights([100, 0], 0, 0)).toEqual({ ok: false, reason: 'last_positive' });
  });

  it('allows 0 while another weight is positive', () => {
    expect(rebalanceWeights([50, 50], 0, 0)).toEqual({ ok: true, weights: [0, 100] });
  });

  it('throws on a bad next value', () => {
    expect(() => rebalanceWeights([50, 50], 0, 101)).toThrow(RangeError);
    expect(() => rebalanceWeights([50, 50], 0, -1)).toThrow(RangeError);
    expect(() => rebalanceWeights([50, 50], 0, 1.5)).toThrow(RangeError);
  });

  it('throws on a bad index or too few members', () => {
    expect(() => rebalanceWeights([50, 50], 2, 10)).toThrow(RangeError);
    expect(() => rebalanceWeights([50, 50], -1, 10)).toThrow(RangeError);
    expect(() => rebalanceWeights([50, 50], 0.5, 10)).toThrow(RangeError);
    expect(() => rebalanceWeights([100], 0, 100)).toThrow(RangeError);
  });

  it('property: ok results total 100 with entries in 0..100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 0, max: 100 }),
        fc.nat(5),
        (n, next, idx) => {
          const r = rebalanceWeights(evenWeights(n), idx % n, next);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.weights.reduce((s, v) => s + v, 0)).toBe(100);
          r.weights.forEach((v) => {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
          });
          expect(r.weights[idx % n]).toBe(next);
        },
      ),
    );
  });
});

describe('evenWeights', () => {
  it('splits 100 in join order', () => {
    expect(evenWeights(3)).toEqual([34, 33, 33]);
    expect(evenWeights(1)).toEqual([100]);
  });
});
