/**
 * D-06..D-09, I32, I33, I43 (05.1). Whole value -> band -> question layers.
 * Bands are the same for everyone (D-08); the whole value alone sets the band, never the payment schedule (I32);
 * a higher band's layers include every lower band's layers (I33); answers to hidden layers are kept (I43).
 */
import type { MinorUnits } from '../../../money/types';
import type { Band, HomeThresholds, Layer, ReasonCode } from '../types';

/**
 * Band rule (v3 5.2, O11): no edges -> 15 with band_rate_missing; whole < edges[0] -> 1;
 * otherwise 2 + count of edges[1..13] strictly below whole.
 */
export function bandOf(whole: MinorUnits, t: HomeThresholds): { readonly band: Band; readonly reasons: readonly ReasonCode[] } {
  if (t.bandEdges.length === 0) return { band: 15, reasons: ['band_rate_missing'] };
  const reasons: ReasonCode[] = t.source === 'fallback' ? ['band_currency_fallback'] : [];
  if (whole < t.bandEdges[0]!) return { band: 1, reasons };
  let count = 0;
  for (let i = 1; i < t.bandEdges.length; i += 1) if (t.bandEdges[i]! < whole) count += 1;
  return { band: (2 + count) as Band, reasons };
}

const L5: readonly Layer[] = ['L0', 'L1p', 'L1e', 'L2'];
const L6: readonly Layer[] = [...L5, 'L5'];
const L8: readonly Layer[] = ['L0', 'L1p', 'L1e', 'L2', 'L3', 'L4', 'L5'];
const L9: readonly Layer[] = [...L8, 'L6'];
const L12: readonly Layer[] = [...L9, 'L7'];

// FincWin reading of v3 5.2 (L1 split into L1p purpose and L1e emergency question).
export const BAND_LAYERS: Readonly<Record<Band, readonly Layer[]>> = Object.freeze({
  1: ['L0'],
  2: ['L0'],
  3: ['L0', 'L1p'],
  4: ['L0', 'L1p', 'L1e'],
  5: L5,
  6: L6,
  7: L6,
  8: L8,
  9: L9,
  10: L9,
  11: L9,
  12: L12,
  13: L12,
  14: L12,
  15: L12,
});

const CANONICAL: readonly Layer[] = ['L0', 'L1p', 'L1e', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];

export function layersFor(band: Band, flags: { readonly periodic: boolean; readonly hasExtras: boolean }): readonly Layer[] {
  const set = new Set<Layer>(BAND_LAYERS[band]);
  if (flags.periodic) {
    set.add('L3');
    set.add('L5');
  }
  if (flags.hasExtras) set.add('L4');
  return CANONICAL.filter((l) => set.has(l));
}

export function insteadLinkFor(band: Band): 'none' | 'link' | 'prominent' | 'open' {
  if (band === 1) return 'none';
  if (band <= 4) return 'link';
  if (band === 5) return 'prominent';
  return 'open';
}

export function stagedRequired(band: Band): boolean {
  return band === 15;
}

/** Answer keys are prefixed with their layer: 'L2.worth', 'L6.closing'. */
export function layerOfAnswerKey(key: string): Layer {
  const dot = key.indexOf('.');
  const prefix = dot < 0 ? key : key.slice(0, dot);
  const found = CANONICAL.find((l) => l === prefix);
  if (found === undefined) throw new RangeError(`layerOfAnswerKey: "${key}" has no layer prefix`);
  return found;
}

/** The answers whose layer is visible. Pure: the input (which keeps hidden answers) is never changed (I43). */
export function visibleLayerAnswers(answers: Readonly<Record<string, unknown>>, layers: readonly Layer[]): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) if (layers.includes(layerOfAnswerKey(k))) out[k] = v;
  return out;
}
