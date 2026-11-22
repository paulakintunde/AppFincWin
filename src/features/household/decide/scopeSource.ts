// 08.1-10 (D-01..D-03, CMP-F19): the household side of a Household check, as plain data the Decide builder takes. PURE. A partner reaches
// it only as the one rounded figure the server returned (08.1-03 partner_money_total); a name never leaves here (members are keyed).
import type { HouseholdMemberRow } from '@/db/householdMembers';
import type { PartnerMoneyTotal } from '@/db/partnerOptins';
import type { SettlementRow } from '@/db/settlements';
import type { SplitDefaultRow } from '@/db/transactionSplits';
import type { ShareScope } from '@/engine/decide/v3';
import type { PairBalance } from '@/engine/household/balances';
import type { HouseholdPartnerSource, HouseholdScopeSource, JointAccountSource } from '@/features/decide/snapshot/v3/householdScope';
import type { HouseholdSpendRuleRow } from '@/db/householdSpendRules';
import type { JointBalanceLeg, JointMonthRow, JointPurposeRow } from '@/db/jointAccounts';
import type { SpendRuleSetting } from '@/engine/household';

type MemberWeight = Pick<HouseholdMemberRow, 'user_id' | 'weight'>;

/** The engine's cap on a check's household size (parseCheckV2 reads 2..20). */
const MAX_MEMBERS = 20;

/**
 * The share a Household check is saved with: the household's default split rule, as any shared line resolves it (the household
 * default row, else even). Null when the household has fewer than 2 people, more than the engine reads, or the viewer is not in it.
 * Weights that are all zero read as even (a weight rule with no weight cannot split).
 */
export function shareScopeOf(
  members: readonly MemberWeight[],
  viewerId: string | null | undefined,
  defaults: readonly Pick<SplitDefaultRow, 'category_ref' | 'rule'>[] | undefined,
): ShareScope | null {
  const myIndex = members.findIndex((m) => m.user_id === viewerId);
  if (members.length < 2 || members.length > MAX_MEMBERS || myIndex < 0) return null;
  const rule = defaults?.find((d) => d.category_ref === null)?.rule ?? 'even';
  const weights = members.map((m) => m.weight);
  if (rule === 'mine') return { kind: 'household', memberCount: members.length, myIndex, rule: { kind: 'mine' } };
  if (rule === 'weight' && weights.some((w) => w > 0)) return { kind: 'household', memberCount: members.length, myIndex, rule: { kind: 'weight', weights } };
  return { kind: 'household', memberCount: members.length, myIndex, rule: { kind: 'even' } };
}

/** Every other member, with the one figure they have shared (both opt-ins on) or none. `totals` is in the order of `others`. */
export function partnersOf(others: readonly MemberWeight[], totals: readonly (PartnerMoneyTotal | undefined)[]): HouseholdPartnerSource[] {
  return others.map((m, i) => {
    const total = totals[i];
    const shared = total !== undefined && total.ok;
    return {
      key: m.user_id,
      weight: m.weight,
      sharing: shared,
      roundedLeft: shared ? total.rounded_left : null,
      currency: shared ? total.currency : '',
    };
  });
}

/** A lapsed settle-up stays news for this long. */
const LAPSED_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * CMP-F04: the viewer's settle-ups as the payer. `lapsedAsPayer`: one the viewer owed that ran out unanswered in the last 30 days
 * (status lapsed, or still pending past its expiry). `owed`: what the viewer owes everyone, from the balances (a pair with net < 0).
 * Null when neither is so, so a Household check with nothing owed carries no settle-up fact.
 */
export function settleUpOf(
  settlements: readonly Pick<SettlementRow, 'payer_id' | 'status' | 'expires_at'>[],
  pairs: readonly Pick<PairBalance, 'net'>[],
  viewerId: string,
  now: number,
): { readonly lapsedAsPayer: boolean; readonly owed: number } | null {
  const lapsedAsPayer = settlements.some((s) => {
    if (s.payer_id !== viewerId) return false;
    const expires = s.expires_at === null ? Number.NaN : Date.parse(s.expires_at);
    const ran = s.status === 'lapsed' || (s.status === 'pending' && Number.isFinite(expires) && expires <= now);
    return ran && Number.isFinite(expires) && now - expires < LAPSED_FOR_MS;
  });
  const owed = pairs.reduce((sum, p) => (p.net < 0 ? sum - Number(p.net) : sum), 0);
  return lapsedAsPayer || owed > 0 ? { lapsedAsPayer, owed } : null;
}

/** What "Same as the bill split" follows: the household's default bill rule over the members. "Mine only" (null) counts as What each person brings. */
export function billWeightsOf(members: readonly MemberWeight[], defaults: readonly Pick<SplitDefaultRow, 'category_ref' | 'rule'>[] | undefined): Record<string, number> | null {
  const rule = defaults?.find((d) => d.category_ref === null)?.rule ?? 'even';
  if (rule === 'mine') return null;
  const weighted = rule === 'weight' && members.some((m) => m.weight > 0);
  return Object.fromEntries(members.map((m) => [m.user_id, weighted ? m.weight : 1]));
}

/** The saved rule row as the engine reads it; null when none is saved. */
export function settingOf(row: Pick<HouseholdSpendRuleRow, 'rule' | 'setup' | 'shares'> | null | undefined): SpendRuleSetting | null {
  return row === null || row === undefined ? null : { rule: row.rule, setup: row.setup, shares: row.shares };
}

export interface JointFactsParts {
  readonly purposes: readonly JointPurposeRow[];
  readonly balances: readonly JointBalanceLeg[];
  readonly month: readonly JointMonthRow[];
}

/** The joint accounts' true figures in each account's own currency: the opening balance plus its paid lines, and this month's totals. Totals only. */
export function jointSourcesOf(read: JointFactsParts | undefined, safetyNetAccountIds: ReadonlySet<string> = new Set()): JointAccountSource[] {
  if (read === undefined) return [];
  return read.purposes.map((a) => {
    const lines = read.balances.filter((b) => b.account_id === a.id && b.currency === a.currency).reduce((sum, b) => sum + b.balance, 0);
    const m = read.month.find((x) => x.account_id === a.id && x.currency === a.currency);
    return {
      id: a.id,
      currency: a.currency,
      purpose: a.joint_purpose,
      spendable: a.joint_savings_spendable,
      // 08.1-23 (Q10, HH-34): the group marks a joint savings account as its shared safety net (accounts.joint_safety_net).
      ...(safetyNetAccountIds.has(a.id) || (a.joint_purpose === 'savings' && a.joint_safety_net === true) ? { safetyNet: true } : {}),
      balance: a.opening_balance + lines,
      monthIn: m?.money_in ?? 0,
      monthOut: m?.money_out ?? 0,
      billsDueBeforeNextIn: 0,
      paidInBy: m?.paid_in_by ?? {},
    };
  });
}

export interface ScopeSourceParts {
  readonly viewerId: string;
  readonly members: readonly MemberWeight[];
  readonly totals: readonly (PartnerMoneyTotal | undefined)[];
  readonly settleUp: HouseholdScopeSource['settleUp'];
  /** 08.1-22: Household (the default here) or Just me with a joint account. */
  readonly scope?: 'me' | 'household';
  readonly spendRule?: Pick<HouseholdSpendRuleRow, 'rule' | 'setup' | 'shares'> | null;
  readonly defaults?: readonly Pick<SplitDefaultRow, 'category_ref' | 'rule'>[];
  readonly joint?: readonly JointAccountSource[];
}

/** The Household source for the builder; null when the viewer is not among the members. */
export function scopeSourceOf(p: ScopeSourceParts): HouseholdScopeSource | null {
  const me = p.members.find((m) => m.user_id === p.viewerId);
  if (me === undefined) return null;
  const others = p.members.filter((m) => m.user_id !== p.viewerId);
  return {
    scope: p.scope ?? 'household',
    viewerId: p.viewerId,
    myWeight: me.weight,
    partners: partnersOf(others, p.totals),
    settleUp: p.settleUp,
    memberKeys: p.members.map((m) => m.user_id),
    setting: settingOf(p.spendRule),
    billWeights: billWeightsOf(p.members, p.defaults),
    joint: p.joint ?? [],
  };
}
