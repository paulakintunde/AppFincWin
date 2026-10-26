/**
 * Envelopes (v3 4.3, I17). Envelopes are only available to their own purpose: a purchase draws only on the envelope
 * it is linked to.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { totalSetAside } from '../../pots';
import type { Envelope } from '../types';

export function envelopesOf(envs: readonly Envelope[], asOf: string): { readonly saved: MinorUnits; readonly monthly: MinorUnits } {
  const t = totalSetAside(envs, asOf);
  return { saved: minorUnits(Number(t.saved)), monthly: t.total };
}

/** The linked envelope's saved amount; null or unknown id gives 0, never another envelope's money. */
export function ownEnvelope(envs: readonly Envelope[], envelopeId: string | null): MinorUnits {
  if (envelopeId === null) return minorUnits(0);
  const e = envs.find((x) => x.id === envelopeId);
  return e === undefined ? minorUnits(0) : e.saved;
}
