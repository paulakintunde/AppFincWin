// PURE. 08.1-22 (CMP-F19, ENG-26, owner 2026-11-20): how a household splits the money its members may spend. Each group picks one rule;
// with none saved, the household's setup type picks the default; with no setup saved, the setup is inferred from the accounts.
//   bring  = "What each person brings": personal money stays each person's own; joint money splits by what each paid in this month
//            (money carried from before splits equally);
//   custom = "A set spending split": the group's own shares over every member;
//   bill   = "Same as the bill split": the household's default bill weights (a "mine only" default counts as bring).
// A custom split that no longer matches the members counts as bring until it is updated (sharesOutOfDate says so).

export type SpendRuleKind = 'bring' | 'custom' | 'bill';
export type HouseholdSetup = 'separate' | 'joint' | 'mixed';

export interface SpendRuleSetting {
  readonly rule: SpendRuleKind | null;
  readonly setup: HouseholdSetup | null;
  /** member key -> share, whole numbers; read only when the rule is custom */
  readonly shares: Readonly<Record<string, number>> | null;
}

/** bring, or one weight per member in member order (the order of the keys the rule was resolved over). */
export type SpendRule = { readonly kind: 'bring' } | { readonly kind: 'shares'; readonly weights: readonly number[] };

export interface ResolvedSpendRule {
  /** how the pooled PERSONAL money splits */
  readonly personal: SpendRule;
  /** how joint money splits: 'paidIn' = by what each paid in this month (carried money equally), else a set of weights */
  readonly joint: Extract<SpendRule, { kind: 'shares' }> | 'paidIn';
  /** the saved custom split no longer matches the members: bring is counted until it is updated */
  readonly sharesOutOfDate: boolean;
  /** the rule actually counted */
  readonly rule: SpendRuleKind;
}

const BRING: SpendRule = { kind: 'bring' };

/** The rule a household gets with none saved: separate accounts and mixed bring what they bring; one joint account follows the bill split. */
export function defaultRuleFor(setup: HouseholdSetup): SpendRuleKind {
  return setup === 'joint' ? 'bill' : 'bring';
}

/** No setup saved: no joint account is Separate; joint plus a personal cash account is Mixed; only joint cash is One joint account. */
export function inferSetup(f: { readonly hasJoint: boolean; readonly hasPersonalCash: boolean; readonly hasJointCash: boolean }): HouseholdSetup {
  if (!f.hasJoint) return 'separate';
  if (f.hasPersonalCash) return 'mixed';
  return f.hasJointCash ? 'joint' : 'separate';
}

function positiveSum(weights: readonly number[]): number {
  return weights.reduce((a, b) => a + Math.max(0, b), 0);
}

const shares = (weights: readonly number[]) => ({ kind: 'shares', weights }) as const;

/**
 * @param setting what the household saved (or nulls)
 * @param allKeys every current member, in member order
 * @param billWeights the household's default bill weights per member key; null = the default is "mine only"
 * @param inferred the setup worked out from the accounts, used when no setup is saved
 */
export function resolveSpendRule(
  setting: SpendRuleSetting | null,
  allKeys: readonly string[],
  billWeights: Readonly<Record<string, number>> | null,
  inferred: HouseholdSetup,
): ResolvedSpendRule {
  const asked: SpendRuleKind = setting?.rule ?? defaultRuleFor(setting?.setup ?? inferred);
  const saved = setting?.shares ?? null;
  if (asked === 'custom') {
    const s = saved;
    if (s === null) return { personal: BRING, joint: 'paidIn', sharesOutOfDate: true, rule: 'bring' };
    const w = allKeys.map((k) => s[k] ?? -1); // a member with no saved share is invalid
    const ok = Object.keys(s).length === allKeys.length && w.every((x) => Number.isInteger(x) && x >= 0) && w.reduce((a, b) => a + b, 0) === 100;
    if (!ok) return { personal: BRING, joint: 'paidIn', sharesOutOfDate: true, rule: 'bring' };
    const weights = shares(w);
    return { personal: weights, joint: weights, sharesOutOfDate: false, rule: 'custom' };
  }
  if (asked === 'bill') {
    const w = billWeights === null ? [] : allKeys.map((k) => billWeights[k] ?? 0);
    if (positiveSum(w) === 0) return { personal: BRING, joint: 'paidIn', sharesOutOfDate: false, rule: 'bring' };
    const weights = shares(w);
    return { personal: weights, joint: weights, sharesOutOfDate: false, rule: 'bill' };
  }
  return { personal: BRING, joint: 'paidIn', sharesOutOfDate: false, rule: 'bring' };
}
