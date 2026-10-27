/**
 * Funds for the judge (05.1 plan 21; v3 §4.4, I17, D-22, D-26, D-30). Composes the balance, the suggested unspent
 * figure, the user's rolled-forward unspent figure, the emergency fund and the envelopes.
 * I17: suggested + bills still due + Erest = the spending balance (profile (d) 'balance' uses its own horizon bills and
 * no Erest, I39, so the partition is stated for the other profiles). The fund is never a term (D-43, D-54).
 * Bound on a later-month refund (Phase 05.1 risk 3): rollForward adds a refund logged after its purchase back in full,
 * so unspent can exceed its pre-purchase figure only when the purchase sat inside planned everyday spending. The user's
 * confirmed figure is never replaced (D-30); the gap is surfaced through `drifted` against `suggested`.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import type { Funds, MonthModel, V3Inputs } from '../types';
import { emergencyOf } from './emergency';
import { envelopesOf, ownEnvelope } from './envelopes';
import { rollForward, suggestedUnspent, unspentState } from './unspent';

interface Spending {
  readonly spending: MinorUnits;
  readonly ringFenced: MinorUnits;
  readonly envelopesAssumedInside: number;
  readonly unstatedAccounts: readonly string[];
  readonly fundUnlinked: boolean;
}

/**
 * D-54: the spending balance is built from the uses the user stated. Everyday accounts count (less envelope money inside
 * them); mixed accounts count less their put-aside (D-55: linked envelopes, goals and fund + the stated extra set-aside);
 * dedicated and untouched accounts never count, and an account with no stated use is listed for the first question.
 * Envelope money linked to no account is subtracted (cautious) and counted. D-62: a fund linked to no stated account is
 * subtracted too (cautious) and flagged. Without `inputs.accounts` (hand-built tests) the balance is the spending balance.
 */
function spendingOf(inputs: V3Inputs): Spending {
  const accounts = inputs.accounts;
  const envs = inputs.envelopes;
  const ids = new Set((accounts ?? []).map((a) => a.id));
  const linkedTo = (id: string): number => envs.filter((e) => e.accountId === id).reduce((t, e) => t + e.saved, 0);
  let total: number = accounts === undefined ? inputs.balance : 0;
  let fenced = 0;
  const unstated: string[] = [];
  for (const a of accounts ?? []) {
    const use = a.use;
    if (use === null) unstated.push(a.id);
    else if (use.kind === 'everyday') {
      total += a.balance - linkedTo(a.id);
      fenced += linkedTo(a.id);
    } else if (use.kind === 'mixed') {
      const aside = linkedTo(a.id) + (inputs.emergency?.accountId === a.id ? inputs.emergency.amount : 0) + (use.extraSetAside ?? 0);
      const kept = Math.max(0, a.balance - aside);
      total += kept;
      fenced += a.balance - kept;
    }
  }
  const unlinked = envs.filter((e) => e.accountId == null || !ids.has(e.accountId));
  const inside = unlinked.reduce((t, e) => t + e.saved, 0);
  total -= inside;
  fenced += inside;
  const fundUnlinked =
    accounts !== undefined && inputs.emergency != null && (inputs.emergency.accountId == null || !ids.has(inputs.emergency.accountId));
  if (fundUnlinked && inputs.emergency != null) {
    total -= inputs.emergency.amount;
    fenced += inputs.emergency.amount;
  }
  return {
    spending: minorUnits(Math.max(0, total)),
    ringFenced: minorUnits(fenced),
    envelopesAssumedInside: unlinked.filter((e) => e.saved > 0).length,
    unstatedAccounts: unstated,
    fundUnlinked,
  };
}

export function buildFunds(inputs: V3Inputs, month: MonthModel, envelopeId: string | null): Funds {
  const env = envelopesOf(inputs.envelopes, inputs.asOf);
  const emergency = emergencyOf(inputs.emergency).amount;
  const sp = spendingOf(inputs);
  const suggested = suggestedUnspent({
    asOf: inputs.asOf,
    spending: sp.spending,
    billsDue: month.billsDue,
    erest: month.erest,
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
    heldBridges: inputs.heldBridges ?? [],
  });
  return {
    balance: inputs.balance,
    suggested,
    unspent,
    emergency,
    envelopesSaved: env.saved,
    envelopesMonthly: env.monthly,
    ownEnvelope: ownEnvelope(inputs.envelopes, envelopeId),
    spending: sp.spending,
    ringFenced: sp.ringFenced,
    envelopesAssumedInside: sp.envelopesAssumedInside,
    unstatedAccounts: sp.unstatedAccounts,
    fundUnlinked: sp.fundUnlinked,
  };
}
