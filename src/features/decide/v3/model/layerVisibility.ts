/**
 * 05.3-16 (P-11, T-05.3-16-01/02). PURE. Which Check cards show, driven by Purchase.layers from the engine plus the
 * pay mode. The emergency follow-up needs L1e and an EMERGENCY_PURPOSES purpose; the engine's canUseEmergency stays
 * the authority on the answer itself.
 */
import { EMERGENCY_PURPOSES, insteadLinkFor, stagedRequired, type Band, type Layer, type Purpose } from '@/engine/decide/v3';

export interface LayerVisibility {
  readonly purpose: boolean;
  readonly emergencyFollowUp: boolean;
  readonly value: boolean;
  readonly plan: boolean;
  readonly costs: boolean;
  readonly major: boolean;
  readonly veryLarge: boolean;
  readonly staged: boolean;
  readonly wholePlanLink: boolean;
  readonly instead: 'none' | 'link' | 'prominent' | 'open';
}

export function layerVisibility(args: { layers: readonly Layer[]; band: Band | null; payMode: 'once' | 'plan'; purpose: Purpose | null }): LayerVisibility {
  const { layers, band, payMode, purpose } = args;
  const has = (l: Layer): boolean => layers.includes(l);
  const emergencyPurpose = purpose !== null && purpose.kind === 'preset' && (EMERGENCY_PURPOSES as readonly string[]).includes(purpose.value);
  return {
    purpose: has('L1p'),
    emergencyFollowUp: has('L1e') && emergencyPurpose,
    value: has('L2'),
    plan: has('L3') || payMode === 'plan',
    costs: has('L4'),
    major: has('L6'),
    veryLarge: has('L7'),
    staged: band !== null && stagedRequired(band),
    wholePlanLink: has('L5') && payMode === 'plan',
    instead: band === null ? 'none' : insteadLinkFor(band),
  };
}

export function revealedLayers(prev: readonly Layer[], next: readonly Layer[]): readonly Layer[] {
  return next.filter((l) => !prev.includes(l));
}
