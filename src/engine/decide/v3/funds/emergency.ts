/**
 * The emergency fund as stored (v3 3.7, I31). Since 05.4 (D-35, D-41, D-49) it is the money saved in the safety net when no
 * safety-net record exists (safetyNet.ts); the 05.1 I38 purpose gate is retired, so any purchase that uses it is "Dips into your
 * safety net", whatever its purpose. "Not set" is a fact (a notice), never advice.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import type { EmergencyFund, Notice, V3Account, V3Inputs } from '../types';

export function emergencyOf(e: EmergencyFund | null): { readonly amount: MinorUnits | null; readonly notice: Notice | null } {
  if (e === null) return { amount: null, notice: { code: 'emergency_not_set', values: {} } };
  return { amount: e.amount, notice: null };
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
