import { BAND_EDGES_USD, homeThresholds, type HomeThresholds, type Layer } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money/types';
import { bandChip, compactAmount } from '../bandChip';

const m = minorUnits;
const usd: HomeThresholds = homeThresholds('USD', null);
const missing: HomeThresholds = { bandEdges: [], unspentDrift: m(0), quotedTolerance: m(0), source: 'missing' };

describe('compactAmount', () => {
  it.each([
    [500000, 2, 'decide.v3.ui.band.thousands', 5],
    [137000, 2, null, 137000],
    [100000000, 2, 'decide.v3.ui.band.millions', 1],
    [5000, 0, 'decide.v3.ui.band.thousands', 5],
    [3000000, 0, 'decide.v3.ui.band.millions', 3],
    [0, 2, null, 0],
    [-500000, 2, null, -500000],
  ])('compacts %p at exponent %p', (minor, exp, key, value) => {
    expect(compactAmount(m(minor), exp)).toEqual({ key, value });
  });
});

describe('bandChip', () => {
  const layers: readonly Layer[] = ['L0', 'L1p', 'L1e', 'L3', 'L5'];

  it('band 3 is between edges 1 and 2', () => {
    const c = bandChip({ band: 3, thresholds: usd, layers });
    expect(c).toMatchObject({ n: 3, rangeKey: 'decide.v3.ui.band.between', low: usd.bandEdges[1], high: usd.bandEdges[2], titleKey: 'decide.v3.ui.band.title' });
    expect(c.layerKeys).toEqual(['decide.v3.ui.band.layer.L0', 'decide.v3.ui.band.layer.L1p', 'decide.v3.ui.band.layer.L3', 'decide.v3.ui.band.layer.L5']);
  });
  it('band 1 is below the first edge', () => {
    expect(bandChip({ band: 1, thresholds: usd, layers: ['L0'] })).toMatchObject({ rangeKey: 'decide.v3.ui.band.below', low: null, high: usd.bandEdges[0] });
  });
  it('band 15 is over the last edge', () => {
    expect(bandChip({ band: 15, thresholds: usd, layers })).toMatchObject({ rangeKey: 'decide.v3.ui.band.above', low: usd.bandEdges[13], high: null });
  });
  it('missing edges show only the band number', () => {
    expect(bandChip({ band: 15, thresholds: missing, layers })).toMatchObject({ n: 15, rangeKey: null, low: null, high: null, titleKey: 'decide.v3.ui.band.titleOnly' });
  });
  it('a short edge list shows only the band number', () => {
    expect(bandChip({ band: 5, thresholds: { ...usd, bandEdges: usd.bandEdges.slice(0, 3) }, layers }).rangeKey).toBeNull();
  });
  it('no band (no price) has no range', () => {
    expect(bandChip({ band: null, thresholds: usd, layers: [] })).toMatchObject({ n: null, rangeKey: null, titleKey: 'decide.v3.ui.band.titleOnly', layerKeys: [] });
  });
  it('the edge table has 14 edges', () => {
    expect(BAND_EDGES_USD.length).toBe(14);
  });
});
