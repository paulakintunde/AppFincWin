// PURE. 08.1-25 (CMP-F19, ENG-26, owner one-earner fix 2026-11-21, Q1 A): which members get a $0 share of the joint money only
// because of the group's rule. Under "What each person brings" joint money earned this month splits by what each paid in; under
// "Same as the bill split" it splits by the bill weights. A member who paid nothing into a joint account this month, or who sits at
// 0% of the bill split, then counts $0 of it. The screens SUGGEST an equal set split for them; the group chooses, the app never
// switches. Reads only joint pay-in totals and joint balances the group already sees; private accounts are never read.
// A set split the group chose (even one with a 0% member) is a deliberate choice and is never flagged; set shares out of date are
// covered by the "Update shares" line.
import { jointSlices } from './jointMoney';
import type { JointAccountFacts } from './jointMoney';
import type { ResolvedSpendRule } from './spendRule';
import { evenWeights } from './weights';

export interface ZeroShareArgs {
  readonly resolved: ResolvedSpendRule;
  readonly joint: readonly JointAccountFacts[];
  /** the household's bill weights in member order; null = equal */
  readonly billWeights: readonly number[] | null;
  readonly memberCount: number;
}

/** Member indexes (in member order) whose share of the counted joint money is $0 because of the rule. */
export function zeroShareMembers(a: ZeroShareArgs): number[] {
  const n = a.memberCount;
  const { resolved } = a;
  if (n < 2 || a.joint.length === 0 || resolved.sharesOutOfDate || resolved.rule === 'custom') return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  const cashOf = (i: number): number => jointSlices(a.joint, resolved.joint, a.billWeights, i, n).cash;
  const counted = idx.reduce((s, i) => s + cashOf(i), 0);
  if (counted <= 0) return [];
  const even = { kind: 'shares', weights: evenWeights(n) } as const;
  return idx.filter((i) => {
    if (a.joint.some((j) => (j.paidInBy?.[i] ?? 0) !== 0)) return false;
    return cashOf(i) === 0 && jointSlices(a.joint, even, a.billWeights, i, n).cash > 0;
  });
}
