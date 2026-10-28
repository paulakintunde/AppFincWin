/**
 * Emergency fund lock (v3 3.7, I31, I38, D-19). The fund is shown, never spent in ordinary checks: only a purchase
 * marked an emergency whose purpose is a necessity or for work may use it. "Not set" is a fact (a notice), never advice.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { ceilDivide } from '../../../payoff/types';
import { canUseEmergency } from '../judge/options';
import type { EmergencyFund, Notice, Purpose, V3Account, V3Inputs } from '../types';

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

/**
 * Owner decision 2026-10-28: a fund linked to an account follows that account's live balance on every check.
 * A mixed account also holds spending money (D-04, D-55), so there the fund is the stated amount, capped at what the
 * account holds. A fund with no link, or linked to an account that is not listed, stays as stored. Integer minor units.
 */
export function liveEmergencyOf(e: EmergencyFund | null, accounts: readonly V3Account[] | undefined): EmergencyFund | null {
  if (e === null || e.accountId == null || accounts === undefined) return e;
  const acct = accounts.find((a) => a.id === e.accountId);
  if (acct === undefined) return e;
  const held = Math.max(0, acct.balance);
  const amount = acct.use !== null && acct.use.kind === 'mixed' ? Math.min(e.amount, held) : held;
  return amount === e.amount ? e : { ...e, amount: minorUnits(amount) };
}

/** The inputs with the fund at its live amount; the same object when nothing changes. */
export function withLiveEmergency(inputs: V3Inputs): V3Inputs {
  const emergency = liveEmergencyOf(inputs.emergency, inputs.accounts);
  return emergency === inputs.emergency ? inputs : { ...inputs, emergency };
}
