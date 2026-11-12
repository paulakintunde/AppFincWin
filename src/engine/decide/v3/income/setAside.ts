/**
 * 06.1 FIN-20 (owner D-26, 2026-11-12; cases TX-10 .. TX-15): the self-employed tax set-aside. A user-typed share, never a tax
 * calculation and never a suggested rate: "freelance income is counted after the share the user says they put aside for tax".
 *
 * - Applies only when the income profile's types include freelance and a share above 0 is typed. 'mix' alone and commission do
 *   not get it (owner, 2026-11-12). The share is clamped to 0 .. MAX_TAX_SET_ASIDE_BP (60%, the decide_settings column's range).
 * - Freelance pay: an income line that is the profile's own variable income (no income kind and no counts-as mark of its own or its
 *   series'), and, when the profile has no salary part, the pay series and its lines too. Salary is never touched.
 * - Each freelance pay counts at its amount less the share, the share rounded half up per payment, in minor units (owner). The
 *   steady figure, the pay series amount and the confirmed expected income (with no salary part) are cut the same way.
 * - The share of freelance pay already in this month is still in the account but kept for tax (owner: hold it back), so it comes off
 *   the spending balance, the first everyday account and an unspent figure confirmed on or after it arrived.
 * - The fact tax_set_aside { percent, amount } is shown on every answer it changed (owner); amount is the share of a usual month's
 *   freelance pay: the steady figure when one is set, else this month's freelance pay so far.
 *
 * Returns the inputs with taxSetAsideBp cleared, so a second prepare (the quick-line overlay) never cuts twice.
 * Pure: asOf comes from the inputs.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { yearMonthOf } from '../dates';
import { planOf } from '../month/incomeProfile';
import { seriesIndex } from '../month/series';
import type { Fact, V3Inputs, V3Line, V3Month, V3Series } from '../types';

/** 60%: the most the decide_settings.tax_set_aside_bp column holds. */
export const MAX_TAX_SET_ASIDE_BP = 6000;

export interface SetAside {
  readonly inputs: V3Inputs;
  /** null when the set-aside changed nothing. */
  readonly fact: Fact | null;
}

/** The share in force, in basis points: 0 when it does not apply. */
export function setAsideBpOf(inputs: Pick<V3Inputs, 'taxSetAsideBp' | 'profile'>): number {
  const raw = inputs.taxSetAsideBp ?? 0;
  if (inputs.profile === null || !inputs.profile.types.includes('freelance')) return 0;
  const bp = Math.trunc(raw);
  return bp <= 0 ? 0 : bp > MAX_TAX_SET_ASIDE_BP ? MAX_TAX_SET_ASIDE_BP : bp;
}

/** The share of one payment, rounded half up. */
export function shareOf(amount: number, bp: number): MinorUnits {
  return minorUnits(Number(divideHalfUp(BigInt(amount) * BigInt(bp), 10000n)));
}

/** "25", "12.5", "12.34": the share as readable percent text. */
export function percentText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

export function withTaxSetAside(raw: V3Inputs): SetAside {
  const bp = setAsideBpOf(raw);
  const cleared: V3Inputs = raw.taxSetAsideBp === undefined ? raw : { ...raw, taxSetAsideBp: null };
  if (bp === 0) return { inputs: cleared, fact: null };
  const profile = raw.profile as NonNullable<V3Inputs['profile']>;
  const plan = planOf(profile);
  const idx = seriesIndex(raw.series);
  const kept = (n: number): MinorUnits => minorUnits(n - shareOf(n, bp));
  const isFreelance = (l: V3Line): boolean => {
    if (l.role !== 'income') return false;
    const s: V3Series | undefined = l.seriesId === null ? undefined : idx.get(l.seriesId);
    if (s !== undefined && s.role === 'pay') return !plan.paySalary;
    return (l.incomeKind ?? s?.incomeKind ?? null) === null && (l.countsAs ?? s?.countsAs ?? null) === null;
  };
  const ym = yearMonthOf(raw.asOf);
  let heldNow = 0;
  let heldForAnchor = 0;
  let thisMonthShare = 0;
  let changed = false;
  const cut = (m: V3Month): V3Month => ({
    ...m,
    lines: m.lines.map((l) => {
      if (!isFreelance(l)) return l;
      const share = shareOf(l.amount, bp);
      if (share === 0) return l;
      changed = true;
      if (m.month === ym && l.status === 'paid' && l.date <= raw.asOf) {
        heldNow += share;
        thisMonthShare += share;
        if (raw.unspent !== null && l.date <= raw.unspent.at) heldForAnchor += share;
      }
      return { ...l, amount: minorUnits(l.amount - share) };
    }),
  });
  const months = raw.months.map(cut);
  const series = raw.series.map((s) => {
    if (s.role !== 'pay' || plan.paySalary || shareOf(s.amount, bp) === 0) return s;
    changed = true;
    return { ...s, amount: kept(s.amount) };
  });
  const steadyShare = profile.steady === null ? 0 : shareOf(profile.steady, bp);
  if (steadyShare > 0) changed = true;
  const expectedIncome =
    raw.expectedIncome === undefined || plan.paySalary
      ? raw.expectedIncome
      : raw.expectedIncome.map((e) => {
          if (shareOf(e.amount, bp) === 0) return e;
          changed = true;
          return { ...e, amount: kept(e.amount) };
        });
  if (!changed) return { inputs: cleared, fact: null };
  const accounts = raw.accounts;
  const everyday = accounts === undefined ? -1 : accounts.findIndex((a) => a.use?.kind === 'everyday');
  const inputs: V3Inputs = {
    ...cleared,
    months,
    series,
    profile: steadyShare === 0 ? profile : { ...profile, steady: kept(profile.steady as number) },
    ...(expectedIncome === undefined ? {} : { expectedIncome }),
    balance: minorUnits(raw.balance - heldNow),
    // only this month's shares dated on or before the confirmed figure are in it (an earlier figure has none)
    unspent: raw.unspent === null ? null : { ...raw.unspent, amount: minorUnits(raw.unspent.amount - heldForAnchor) },
    ...(accounts === undefined ? {} : { accounts: accounts.map((a, i) => (i === everyday ? { ...a, balance: minorUnits(a.balance - heldNow) } : a)) }),
  };
  const amount = steadyShare > 0 ? steadyShare : thisMonthShare;
  return { inputs, fact: { code: 'tax_set_aside', values: { percent: percentText(bp), amount } } };
}
