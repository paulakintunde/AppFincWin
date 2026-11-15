import { homeThresholds } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';

import { isBigBuy, isLargePrice } from '../bigBuy';

/** The band-6 edge (edges[4]) in a currency, read from the engine table: never a literal. */
function edge6(currency: string): number {
  const edges = homeThresholds(currency, null).bandEdges;
  return Number(edges[4]);
}

describe('isLargePrice (D-09: over the engine band-6 edge)', () => {
  it.each(['USD', 'GBP', 'EUR', 'JPY'])('%s: the edge itself is not large, one minor unit over is', (currency) => {
    const e = edge6(currency);
    expect(isLargePrice(minorUnits(e), currency, null)).toBe(false);
    expect(isLargePrice(minorUnits(e + 1), currency, null)).toBe(true);
    expect(isLargePrice(minorUnits(0), currency, null)).toBe(false);
  });

  it('US$5,000 (500,000 cents) is the USD edge and is not large', () => {
    expect(edge6('USD')).toBe(500_000);
    expect(isLargePrice(minorUnits(500_000), 'USD', null)).toBe(false);
    expect(isLargePrice(minorUnits(500_001), 'USD', null)).toBe(true);
  });

  it('GBP and EUR edges come from the band table, not the US$ number', () => {
    expect(edge6('GBP')).not.toBe(500_000);
    expect(isLargePrice(minorUnits(450_000), 'GBP', null)).toBe(true);
  });

  it('a currency off the table uses the rate it is given', () => {
    const rate = { num: 2n, den: 1n };
    const e = Number(homeThresholds('XTS', rate).bandEdges[4]);
    expect(isLargePrice(minorUnits(e), 'XTS', rate)).toBe(false);
    expect(isLargePrice(minorUnits(e + 1), 'XTS', rate)).toBe(true);
  });

  it('missing band edges count as large (cautious)', () => {
    expect(isLargePrice(minorUnits(1), 'XTS', null)).toBe(true);
  });
});

describe('isBigBuy (D-09)', () => {
  const usd = homeThresholds('USD', null);
  const small = { whole: minorUnits(18_000), thresholds: usd } as const;

  it('a small cash buy of an everyday or tech kind goes straight to the answer', () => {
    expect(isBigBuy({ ...small, kind: 'tech', payMode: 'once' })).toBe(false);
    expect(isBigBuy({ ...small, kind: 'everyday', payMode: 'once' })).toBe(false);
    expect(isBigBuy({ ...small, kind: null, payMode: 'once' })).toBe(false);
  });

  it('a car opens the stepper at any price (running costs)', () => {
    expect(isBigBuy({ ...small, kind: 'car', payMode: 'once' })).toBe(true);
  });

  it('a home returns true if it ever reaches here', () => {
    expect(isBigBuy({ ...small, kind: 'home', payMode: 'once' })).toBe(true);
  });

  it('a buy paid over time opens the stepper', () => {
    expect(isBigBuy({ ...small, kind: 'tech', payMode: 'plan' })).toBe(true);
  });

  it('a large price opens the stepper; the $3,500 laptop in cash does not', () => {
    expect(isBigBuy({ whole: minorUnits(350_000), thresholds: usd, kind: 'tech', payMode: 'once' })).toBe(false);
    expect(isBigBuy({ whole: minorUnits(900_000), thresholds: usd, kind: 'tech', payMode: 'once' })).toBe(true);
  });

  // 06.1-56 (H-9, CN-6): the route reads only the loaded thresholds, so cold and warm starts agree.
  it('routes the same item the same way with the same loaded thresholds, cold or warm', () => {
    const rate = { num: 2n, den: 1n };
    const cold = homeThresholds('XTS', rate);
    const warm = homeThresholds('XTS', rate);
    const edge = Number(cold.bandEdges[4]);
    for (const whole of [edge - 1, edge, edge + 1]) {
      const a = isBigBuy({ whole: minorUnits(whole), thresholds: cold, kind: 'tech', payMode: 'once' });
      const b = isBigBuy({ whole: minorUnits(whole), thresholds: warm, kind: 'tech', payMode: 'once' });
      expect(a).toBe(b);
    }
    expect(isBigBuy({ whole: minorUnits(edge), thresholds: cold, kind: 'tech', payMode: 'once' })).toBe(false);
  });

  it('GBP edges come from the loaded thresholds, not the US$ number', () => {
    const gbp = homeThresholds('GBP', null);
    expect(isBigBuy({ whole: minorUnits(450_000), thresholds: gbp, kind: 'tech', payMode: 'once' })).toBe(true);
    expect(isBigBuy({ whole: minorUnits(450_000), thresholds: usd, kind: 'tech', payMode: 'once' })).toBe(false);
  });
});
