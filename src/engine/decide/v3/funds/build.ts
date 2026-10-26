/**
 * Funds for the judge (05.1 plan 21; v3 §4.4, I17, D-22, D-26, D-30). Composes the balance, the suggested unspent
 * figure, the user's rolled-forward unspent figure, the emergency fund and the envelopes.
 * I17: suggested + envelopes + emergency + bills still due + Erest = balance (profile (d) 'balance' uses its own
 * horizon bills and no Erest, I39, so the partition is stated for the other profiles).
 * Bound on a later-month refund (Phase 05.1 risk 3): rollForward adds a refund logged after its purchase back in full,
 * so unspent can exceed its pre-purchase figure only when the purchase sat inside planned everyday spending. The user's
 * confirmed figure is never replaced (D-30); the gap is surfaced through `drifted` against `suggested`.
 */
import type { Funds, MonthModel, V3Inputs } from '../types';
import { emergencyOf } from './emergency';
import { envelopesOf, ownEnvelope } from './envelopes';
import { rollForward, suggestedUnspent, unspentState } from './unspent';

export function buildFunds(inputs: V3Inputs, month: MonthModel, envelopeId: string | null): Funds {
  const env = envelopesOf(inputs.envelopes, inputs.asOf);
  const emergency = emergencyOf(inputs.emergency).amount;
  const suggested = suggestedUnspent({
    asOf: inputs.asOf,
    balance: inputs.balance,
    billsDue: month.billsDue,
    erest: month.erest,
    envelopesSaved: env.saved,
    emergency,
    profile: inputs.profile,
    series: inputs.series,
  });
  const roll =
    inputs.unspent === null
      ? null
      : rollForward({ anchor: inputs.unspent, asOf: inputs.asOf, months: inputs.months, series: inputs.series, e: month.e });
  const unspent = unspentState({
    anchor: inputs.unspent,
    asOf: inputs.asOf,
    roll,
    suggested,
    driftThreshold: inputs.thresholds.unspentDrift,
  });
  return {
    balance: inputs.balance,
    suggested,
    unspent,
    emergency,
    envelopesSaved: env.saved,
    envelopesMonthly: env.monthly,
    ownEnvelope: ownEnvelope(inputs.envelopes, envelopeId),
  };
}
