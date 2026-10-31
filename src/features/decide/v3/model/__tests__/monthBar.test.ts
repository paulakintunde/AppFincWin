import fc from 'fast-check';
import { monthBar } from '../monthBar';
import { SAM_PARTS as SAM, monthOf } from './monthFixture';

describe('monthBar', () => {
  it('Sam: 2,705 + 870 + 425 = 4,000', () => {
    const b = monthBar(monthOf(SAM));
    expect(b).toEqual({
      moneyIn: 400000,
      outSoFar: 270500,
      setAside: 10000,
      stillToCome: 77000,
      left: 42500,
      over: 0,
      negative: false,
      segments: [
        { kind: 'out', amount: 270500 },
        { kind: 'setAside', amount: 10000 },
        { kind: 'toCome', amount: 77000 },
        { kind: 'left', amount: 42500 },
      ],
      captionKey: 'decide.v3.ui.home.onTrack',
      figure: 42500,
    });
    expect(b.outSoFar + b.setAside + b.stillToCome + b.left).toBe(b.moneyIn);
  });

  it('set aside is its own part, not still to come (A4)', () => {
    const b = monthBar(monthOf({ moneyIn: 500000, billsPaid: 100000, everydayLogged: 50000, billsDue: 20000, erest: 30000, setAside: 40000 }));
    expect(b.stillToCome).toBe(50000);
    expect(b.setAside).toBe(40000);
    expect(b.left).toBe(260000);
    expect(b.segments.map((x) => [x.kind, x.amount])).toEqual([['out', 150000], ['setAside', 40000], ['toCome', 50000], ['left', 260000]]);
    expect(monthBar(monthOf({ ...SAM, setAside: 0 })).segments.some((x) => x.kind === 'setAside')).toBe(false);
  });

  it('overspent: no left segment, an over segment, capped out + toCome', () => {
    const b = monthBar(monthOf({ ...SAM, moneyIn: 315000 }));
    expect(b.negative).toBe(true);
    expect(b.left).toBe(0);
    expect(b.over).toBe(42500);
    expect(b.figure).toBe(42500);
    expect(b.captionKey).toBe('decide.v3.ui.home.onTrackOver');
    expect(b.segments.some((s) => s.kind === 'left')).toBe(false);
    expect(b.segments.find((s) => s.kind === 'over')?.amount).toBe(42500);
    const total = b.segments.filter((s) => s.kind === 'out' || s.kind === 'toCome').reduce((a, s) => a + s.amount, 0);
    expect(total).toBeLessThanOrEqual(b.moneyIn);
  });

  it('caps when out alone exceeds money in', () => {
    const b = monthBar(monthOf({ ...SAM, moneyIn: 100000 }));
    expect(b.segments.find((s) => s.kind === 'out')?.amount).toBe(100000);
    expect(b.segments.some((s) => s.kind === 'toCome')).toBe(false);
  });

  it('exactly zero left draws no left segment and is not negative', () => {
    const b = monthBar(monthOf({ ...SAM, moneyIn: 357500 }));
    expect(b.negative).toBe(false);
    expect(b.segments.some((s) => s.kind === 'left' || s.kind === 'over')).toBe(false);
  });

  it('property: parts sum to money in, amounts are never negative', () => {
    const n = fc.integer({ min: 0, max: 1_000_000 });
    fc.assert(
      fc.property(n, n, n, n, n, fc.integer({ min: 0, max: 3_000_000 }), (billsPaid, billsDue, everydayLogged, erest, setAside, moneyIn) => {
        const b = monthBar(monthOf({ moneyIn, billsPaid, billsDue, everydayLogged, erest, setAside }));
        if (!b.negative) expect(b.outSoFar + b.setAside + b.stillToCome + b.left).toBe(moneyIn);
        for (const s of b.segments) expect(s.amount).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });
});
