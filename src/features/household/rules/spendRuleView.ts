// 08.1-23 (CMP-F19, owner 2026-11-21 Q1-Q6, Q12): what the household's spending rule screens show, as plain data. PURE. Every figure
// comes from plan 22's engine (resolveSpendRule, defaultRuleFor, inferSetup) and the shared split helpers; nothing here does money maths
// beyond the largest-remainder split the engine itself uses.
import type { HouseholdSpendRuleRow } from '@/db/householdSpendRules';
import type { SplitDefaultRow } from '@/db/transactionSplits';
import { defaultRuleFor, inferSetup, resolveSpendRule, sharedMoneyFor, zeroShareMembers, type HouseholdSetup, type JointAccountFacts, type SpendRuleKind } from '@/engine/household';
import { evenWeights } from '@/engine/household/weights';
import { minorUnits } from '@/engine/money/types';
import { allocate } from '@/engine/split/allocate';
import { jointToHome, type JointAccountSource } from '@/features/decide/snapshot/v3/householdScope';
import { billWeightsOf, settingOf } from '../decide/scopeSource';

export const SETUPS: readonly HouseholdSetup[] = ['separate', 'joint', 'mixed'];
export const RULES: readonly SpendRuleKind[] = ['bring', 'custom', 'bill'];

type Member = { readonly user_id: string; readonly weight: number };
type Row = Pick<HouseholdSpendRuleRow, 'rule' | 'setup' | 'shares'>;
type Defaults = readonly Pick<SplitDefaultRow, 'category_ref' | 'rule'>[] | undefined;

/** Whole percents that add up to 100 for these weights (largest remainder, as every split); all zero or none = even. */
export function percentsOf(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  if (weights.every((w) => w <= 0)) return [...evenWeights(weights.length)];
  // 08.1-25 (Rule 1): allocate takes only positive weights, so a member at 0 (a 100/0 bill split, a set split with a 0% member) gets
  // 0 and the rest is split among the others; before this the screen threw on such a split.
  const positive = weights.map((w, i) => ({ w, i })).filter((x) => x.w > 0);
  const parts = allocate(minorUnits(100), positive.map((x) => x.w)).map(Number);
  const out = weights.map(() => 0);
  positive.forEach((x, k) => (out[x.i] = parts[k] ?? 0));
  return out;
}

/** The bill split as whole percents per member, or null when the household default is "Mine only" (the rule counts as bring). */
export function billPercentsOf(members: readonly Member[], defaults: Defaults): Record<string, number> | null {
  const bw = billWeightsOf(members, defaults);
  if (bw === null) return null;
  const p = percentsOf(members.map((m) => bw[m.user_id] ?? 0));
  return Object.fromEntries(members.map((m, i) => [m.user_id, p[i] ?? 0]));
}

/** True when the saved shares name exactly these members with whole numbers that add up to 100. */
export function sharesFit(shares: Readonly<Record<string, number>> | null | undefined, ids: readonly string[]): boolean {
  if (shares == null) return false;
  if (Object.keys(shares).length !== ids.length) return false;
  const w = ids.map((id) => shares[id]);
  return w.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0) && w.reduce<number>((a, b) => a + (b ?? 0), 0) === 100 && w.some((x) => (x ?? 0) > 0);
}

/**
 * Q5 (owner 2026-11-21): where the set-shares editor starts. Saved shares that still fit the members are reused; otherwise the bill
 * split's percents; otherwise even.
 */
export function startingShares(row: Row | null | undefined, members: readonly Member[], defaults: Defaults): number[] {
  const ids = members.map((m) => m.user_id);
  const saved = row?.shares ?? null;
  if (saved !== null && sharesFit(saved, ids)) return ids.map((id) => saved[id] ?? 0);
  const bill = billPercentsOf(members, defaults);
  if (bill !== null) return ids.map((id) => bill[id] ?? 0);
  return [...evenWeights(ids.length)];
}

export interface AccountFacts {
  /** the household has at least one live joint account */
  readonly hasJoint: boolean;
  /** the viewer has an account of their own that holds money */
  readonly hasPersonalCash: boolean;
  /** a joint account that is not joint savings */
  readonly hasJointCash: boolean;
}

export interface SpendView {
  /** the setup in force: saved, else worked out from the accounts */
  readonly setup: HouseholdSetup;
  readonly setupInferred: boolean;
  /** the rule the group asked for: saved, else the setup's default */
  readonly asked: SpendRuleKind;
  /** no rule saved: the rule follows the setup's default (Q4) */
  readonly ruleIsDefault: boolean;
  /** the rule actually counted (out-of-date shares count bring) */
  readonly counted: SpendRuleKind;
  readonly outOfDate: boolean;
  /** the viewer's whole percent under the counted rule; null under bring */
  readonly myPercent: number | null;
}

export function spendViewOf(row: Row | null | undefined, members: readonly Member[], defaults: Defaults, viewerId: string | null | undefined, facts: AccountFacts): SpendView {
  const inferred = inferSetup(facts);
  const setup = row?.setup ?? inferred;
  const ids = members.map((m) => m.user_id);
  const asked = row?.rule ?? defaultRuleFor(setup);
  const bill = billWeightsOf(members, defaults);
  const resolved = resolveSpendRule(row ? { rule: row.rule, setup: row.setup, shares: row.shares } : null, ids, bill, inferred);
  const me = ids.indexOf(viewerId ?? '');
  let myPercent: number | null = null;
  if (me >= 0 && resolved.personal.kind === 'shares') myPercent = percentsOf(resolved.personal.weights)[me] ?? null;
  return {
    setup,
    setupInferred: row?.setup == null,
    asked,
    ruleIsDefault: row?.rule == null,
    counted: resolved.rule,
    outOfDate: asked === 'custom' && resolved.sharesOutOfDate,
    myPercent,
  };
}

export interface SharedMoneyParts {
  /** the viewer's own personal money left this month (joint money taken out), minor units in `currency`; null = no figure */
  readonly own: number | null;
  /** each other member's shared figure (both opt-ins on), with its currency */
  readonly partners: readonly { readonly left: number; readonly currency: string }[];
  /** the joint accounts' true figures (plan 22 jointSourcesOf) */
  readonly joint: readonly { readonly currency: string; readonly purpose: string | null; readonly spendable: boolean; readonly safetyNet?: boolean; readonly balance: number }[];
  readonly currency: string;
}

/**
 * Q5 owner addition: this month's money everyone has shared, the pool a set split shares out: the viewer's own money left, each partner
 * figure that is shared, and the joint money that counts (everyday or no purpose: the balance; savings marked spendable and not the
 * safety net: the balance; bills: nothing here, since the bills due are not known on this screen, so the figure never runs high).
 * Only figures already in the household's currency are added (no rate is applied here). Null when the viewer's own figure is missing.
 */
export function sharedMoneyTotal(p: SharedMoneyParts): number | null {
  if (p.own === null) return null;
  const partners = p.partners.filter((x) => x.currency === p.currency).reduce((s, x) => s + x.left, 0);
  const joint = p.joint
    .filter((j) => j.currency === p.currency)
    .reduce((s, j) => {
      const purpose = j.purpose ?? 'everyday';
      if (purpose === 'everyday') return s + j.balance;
      if (purpose === 'savings' && j.spendable && j.safetyNet !== true) return s + j.balance;
      return s;
    }, 0);
  return p.own + partners + joint;
}

/**
 * Q5 owner addition: what each percent means in money, out of `total` (minor units). The parts add up to the total by the same
 * largest-remainder split the engine uses. Null when there is no figure to show (none, or nothing above zero): the percent stands alone.
 */
export function moneyParts(total: number | null, percents: readonly number[]): number[] | null {
  if (total === null || !Number.isInteger(total) || total <= 0 || percents.every((p) => p <= 0)) return null;
  return percents.map((_, i) => Number(sharedMoneyFor(minorUnits(total), percents, i)));
}

export interface ZeroShareParts {
  readonly sources: readonly JointAccountSource[];
  /** the household's Decide currency; null = not known yet (nobody is named) */
  readonly currency: string | null;
  readonly members: readonly Member[];
  readonly row: Row | null;
  readonly defaults: Defaults;
  /** the setup in force (saved, else worked out from the accounts) */
  readonly setup: HouseholdSetup;
}

/**
 * 08.1-25 (owner one-earner fix 2026-11-21, Q1 A): the member ids, in member order, whose share of the joint money is $0 because of
 * the SAVED rule (engine zeroShareMembers). Only joint totals are read. Plan 23's known gap stays: the bills due are not known here, so
 * a joint bills account counts nothing (as the shared-money hint) and is never the reason a member is named; another currency is left
 * out (no rate is applied here).
 */
export function zeroShareIdsOf(p: ZeroShareParts): string[] {
  const currency = p.currency;
  if (currency === null || p.members.length < 2) return [];
  const ids = p.members.map((m) => m.user_id);
  const counted = p.sources.filter((s) => s.purpose !== 'bills');
  const joint: JointAccountFacts[] = jointToHome(counted, ids, (amount, c) => (c === currency ? amount : null)).map((r) => ({
    ...r,
    viewerBalance: minorUnits(0),
    viewerOwnMonth: minorUnits(0),
  }));
  const bill = billWeightsOf(p.members, p.defaults);
  const resolved = resolveSpendRule(settingOf(p.row), ids, bill, p.setup);
  const billWeights = bill === null ? null : ids.map((k) => bill[k] ?? 0);
  return zeroShareMembers({ resolved, joint, billWeights, memberCount: ids.length }).map((i) => ids[i] as string);
}
