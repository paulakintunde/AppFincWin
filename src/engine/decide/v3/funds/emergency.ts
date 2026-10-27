/**
 * Emergency fund lock (v3 3.7, I31, I38, D-19). The fund is shown, never spent in ordinary checks: only a purchase
 * marked an emergency whose purpose is a necessity or for work may use it. "Not set" is a fact (a notice), never advice.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { ceilDivide } from '../../../payoff/types';
import { canUseEmergency } from '../judge/options';
import type { EmergencyFund, Notice, Purpose } from '../types';

export function emergencyOf(e: EmergencyFund | null): { readonly amount: MinorUnits | null; readonly notice: Notice | null } {
  if (e === null) return { amount: null, notice: { code: 'emergency_not_set', values: {} } };
  return { amount: e.amount, notice: null };
}

/** I38: true only when the check is marked an emergency AND its purpose may use the fund. */
export function mayUseEmergency(p: { readonly emergency: boolean; readonly purpose: Purpose | null }): boolean {
  return p.emergency && canUseEmergency(p.purpose);
}

/** How much of the fund an emergency need takes, what is left unmet, and months to rebuild at the typical pace. */
export function emergencyUse(input: {
  readonly need: MinorUnits;
  readonly fund: MinorUnits;
  readonly typicalLeft: MinorUnits | null;
}): { readonly used: MinorUnits; readonly shortfall: MinorUnits; readonly rebuildMonths: number | null } {
  const need = Math.max(0, input.need);
  const fund = Math.max(0, input.fund);
  const used = Math.min(need, fund);
  const shortfall = need - used;
  let rebuildMonths: number | null = null;
  if (used === 0) rebuildMonths = 0;
  else if (input.typicalLeft !== null && input.typicalLeft > 0) {
    rebuildMonths = Number(ceilDivide(BigInt(used), BigInt(input.typicalLeft)));
  }
  return { used: minorUnits(used), shortfall: minorUnits(shortfall), rebuildMonths };
}
