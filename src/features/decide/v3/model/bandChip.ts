/**
 * 05.3-16 (UI-SPEC band chip). PURE. Range text comes from HomeThresholds.bandEdges (P-11), never from hard-coded amounts.
 * The screen formats low / high in the home currency; compactAmount decides whether an edge reads as k or M.
 */
import type { Band, HomeThresholds, Layer } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money/types';

const BAND_EDGE_COUNT = 14;

export function compactAmount(minor: MinorUnits, exponent: number): { key: string | null; value: number } {
  const amount = BigInt(minor);
  const unit = 10n ** BigInt(exponent);
  if (amount > 0n && amount % unit === 0n) {
    const major = amount / unit;
    if (major % 1000000n === 0n) return { key: 'decide.v3.ui.band.millions', value: Number(major / 1000000n) };
    if (major % 1000n === 0n) return { key: 'decide.v3.ui.band.thousands', value: Number(major / 1000n) };
  }
  return { key: null, value: minor };
}

export interface BandChipModel {
  readonly n: Band | null;
  readonly titleKey: string;
  readonly rangeKey: string | null;
  readonly low: MinorUnits | null;
  readonly high: MinorUnits | null;
  readonly layerKeys: readonly string[];
}

export function bandChip(args: { band: Band | null; thresholds: HomeThresholds; layers: readonly Layer[] }): BandChipModel {
  const { band, thresholds, layers } = args;
  const layerKeys = layers.filter((l) => l !== 'L1e').map((l) => `decide.v3.ui.band.layer.${l}`);
  const edges = thresholds.bandEdges;
  if (band === null || thresholds.source === 'missing' || edges.length < BAND_EDGE_COUNT) {
    return { n: band, titleKey: 'decide.v3.ui.band.titleOnly', rangeKey: null, low: null, high: null, layerKeys };
  }
  const title = 'decide.v3.ui.band.title';
  if (band === 1) return { n: band, titleKey: title, rangeKey: 'decide.v3.ui.band.below', low: null, high: edges[0]!, layerKeys };
  if (band === 15) return { n: band, titleKey: title, rangeKey: 'decide.v3.ui.band.above', low: edges[13]!, high: null, layerKeys };
  return { n: band, titleKey: title, rangeKey: 'decide.v3.ui.band.between', low: edges[band - 2]!, high: edges[band - 1]!, layerKeys };
}
