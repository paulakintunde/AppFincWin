/**
 * Funds for the judge (05.1 plan 21; v3 §4.4, I17, D-22, D-26, D-30). Composes the balance, the suggested unspent
 * figure, the user's rolled-forward unspent figure, the emergency fund and the envelopes.
 * I17: suggested + bills still due + Erest = the spending balance (profile (d) 'balance' uses its own horizon bills and
 * no Erest, I39, so the partition is stated for the other profiles). The fund is never a term (D-43, D-54).
 * Two-date refunds (05.2): the month view dates a linked refund on its purchase, but rolled unspent counts it on the day it arrived.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import type { Funds, MonthModel, UnspentSum, V3Inputs } from '../types';
import { emergencyOf, withLiveEmergency } from './emergency';
import { envelopesOf, ownEnvelope } from './envelopes';
import { billsAndErest, heldBackOf, rollForward, suggestedUnspent, unspentState } from './unspent';

interface Spending {
  readonly spending: MinorUnits;
  readonly ringFenced: MinorUnits;
  readonly envelopesAssumedInside: number;
  readonly unstatedAccounts: readonly string[];
  readonly fundUnlinked: boolean;
  readonly parts: SpendingParts;
}

/** The spending balance as a worked sum: gross - mixedSetAside - envelopes - emergency = spending (deductions never exceed what is there). */
interface SpendingParts {
  readonly gross: MinorUnits;
  readonly mixedSetAside: MinorUnits;
  readonly envelopes: MinorUnits;
  readonly emergency: MinorUnits;
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
  let gross: number = accounts === undefined ? inputs.balance : 0;
  let pEnv = 0;
  let pEmg = 0;
  let pMixed = 0;
  const unstated: string[] = [];
  for (const a of accounts ?? []) {
    const use = a.use;
    if (use === null) unstated.push(a.id);
    else if (use.kind === 'everyday') {
      total += a.balance - linkedTo(a.id);
      fenced += linkedTo(a.id);
      gross += a.balance;
      pEnv += linkedTo(a.id);
    } else if (use.kind === 'mixed') {
      const aside = linkedTo(a.id) + (inputs.emergency?.accountId === a.id ? inputs.emergency.amount : 0) + (use.extraSetAside ?? 0);
      const kept = Math.max(0, a.balance - aside);
      total += kept;
      fenced += a.balance - kept;
      gross += a.balance;
      // the fenced money is named in turn: envelopes, then the fund, then the extra the user set aside
      const fe = a.balance - kept;
      const toEnv = Math.min(fe, linkedTo(a.id));
      const toEmg = Math.min(fe - toEnv, inputs.emergency?.accountId === a.id ? inputs.emergency.amount : 0);
      pEnv += toEnv;
      pEmg += toEmg;
      pMixed += fe - toEnv - toEmg;
    }
  }
  const unlinked = envs.filter((e) => e.accountId == null || !ids.has(e.accountId));
  const inside = unlinked.reduce((t, e) => t + e.saved, 0);
  total -= inside;
  fenced += inside;
  pEnv += inside;
  const fundUnlinked =
    accounts !== undefined && inputs.emergency != null && (inputs.emergency.accountId == null || !ids.has(inputs.emergency.accountId));
  if (fundUnlinked && inputs.emergency != null) {
    total -= inputs.emergency.amount;
    fenced += inputs.emergency.amount;
    pEmg += inputs.emergency.amount;
  }
  return {
    spending: minorUnits(Math.max(0, total)),
    ringFenced: minorUnits(fenced),
    envelopesAssumedInside: unlinked.filter((e) => e.saved > 0).length,
    unstatedAccounts: unstated,
    fundUnlinked,
    parts: partsOf(gross, pMixed, pEnv, pEmg),
  };
}

/** Names the deductions so they net to the spending balance: when they overshoot, envelopes give way first, then the fund, then the set-aside. */
function partsOf(gross: number, mixed: number, env: number, emg: number): SpendingParts {
  const g = Math.max(0, gross);
  let over = Math.max(0, mixed + env + emg - g);
  const cut = (v: number): number => {
    const c = Math.min(v, over);
    over -= c;
    return v - c;
  };
  const e = cut(env);
  const f = cut(emg);
  const m = cut(mixed);
  return { gross: minorUnits(g), mixedSetAside: minorUnits(m), envelopes: minorUnits(e), emergency: minorUnits(f) };
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
      : rollForward({ anchor: inputs.unspent, asOf: inputs.asOf, months: inputs.months, logged: inputs.loggedMonths, series: inputs.series, e: month.e });
  const unspent = unspentState({
    anchor: inputs.unspent,
    asOf: inputs.asOf,
    roll,
    suggested,
    driftThreshold: inputs.thresholds.unspentDrift,
    heldBridges: inputs.heldBridges ?? [],
  });
  // D-50: money in the D-54 spending balance that neither the records nor the user's answers explain. `suggested` already
  // holds back bills still due, the Erest still to come (v3 4.4) and put-aside money (D-55), so those are explained.
  // Only the part above the confirmed figure counts; the other direction stays the drift notice (D-30). The threshold and
  // the question are 05.1-44's (needsInput reads funds.unexplained against thresholds.unspentDrift).
  const answer = inputs.unexplainedAnswer;
  const validAnswer = answer != null && Number.isSafeInteger(answer.amount) && answer.amount >= 0 ? answer : null;
  let unexplained: MinorUnits | undefined;
  let ringFenced = sp.ringFenced;
  let shown = unspent;
  if (unspent !== null) {
    const raw = Math.max(0, suggested - unspent.value);
    const covered = validAnswer === null ? 0 : Math.min(validAnswer.amount, raw);
    unexplained = minorUnits(raw - covered);
    if (validAnswer !== null && validAnswer.use === 'spare') {
      // only spare money counts toward a purchase (unspentState always sets available)
      shown = { ...unspent, available: minorUnits((unspent.available as MinorUnits) + covered) };
    } else {
      ringFenced = minorUnits(ringFenced + covered);
    }
  }
  return {
    balance: inputs.balance,
    suggested,
    unspent: shown,
    emergency,
    envelopesSaved: env.saved,
    envelopesMonthly: env.monthly,
    ownEnvelope: ownEnvelope(inputs.envelopes, envelopeId),
    spending: sp.spending,
    ringFenced,
    envelopesAssumedInside: sp.envelopesAssumedInside,
    unstatedAccounts: sp.unstatedAccounts,
    fundUnlinked: sp.fundUnlinked,
    ...(unexplained === undefined ? {} : { unexplained }),
  };
}

/**
 * 05.2-28: the worked sum behind the suggested unspent figure, for the Unspent money card. The same arithmetic as
 * buildFunds, named line by line: gross - mixedSetAside - envelopes - emergency - bills - everyday = suggested, and
 * suggested - heldBack = total (D-38: bridges hold money back from the confirmed figure). Not a second calculation.
 */
export function unspentSum(raw: V3Inputs, month: MonthModel): UnspentSum {
  const inputs = withLiveEmergency(raw); // the UI calls this on inputs that never went through evaluate
  const sp = spendingOf(inputs);
  const input = { asOf: inputs.asOf, billsDue: month.billsDue, erest: month.erest, profile: inputs.profile, series: inputs.series };
  const be = billsAndErest(input);
  const suggested = suggestedUnspent({ ...input, spending: sp.spending });
  const heldBack = heldBackOf(inputs.heldBridges ?? []);
  return {
    gross: sp.parts.gross,
    mixedSetAside: sp.parts.mixedSetAside,
    envelopes: sp.parts.envelopes,
    emergency: sp.parts.emergency,
    bills: be.bills,
    everyday: be.erest,
    suggested,
    heldBack,
    total: minorUnits(suggested - heldBack),
    unstatedAccounts: sp.unstatedAccounts.length,
    unplacedEnvelopes: sp.envelopesAssumedInside,
    hasMixed: (inputs.accounts ?? []).some((a) => a.use !== null && a.use.kind === 'mixed'),
  };
}
