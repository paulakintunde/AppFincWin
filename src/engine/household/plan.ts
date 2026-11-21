// PURE. 08.1-22 (CMP-F19, UX-21, ENG-26): the household money step as one plan, shared by the Decide builder and the right-answer
// fixtures so both run the same maths. Given the group's spending rule, its members, the viewer's joint accounts and the partners
// who count, it says what to lay into the viewer's inputs: the viewer's slice of the joint accounts (and the same with every slice
// zero, for personal money only), and the viewer's personal-pool delta. engine/decide/v3/householdMoney.ts lays it.
import { minorUnits } from '../money/types';
import type { MinorUnits } from '../money/types';
import { jointSlices, withoutJointSlices } from './jointMoney';
import type { JointAccountFacts, JointSlices } from './jointMoney';
import { spendDelta } from './pool';
import { resolveSpendRule } from './spendRule';
import type { HouseholdSetup, ResolvedSpendRule, SpendRuleSetting } from './spendRule';

/** A joint slice laid over the viewer's records (the same shape as engine/decide/v3 JointLay). */
export interface JointLayShape {
  readonly monthDelta: MinorUnits;
  readonly cashDelta: MinorUnits;
  readonly balances: Readonly<Record<string, MinorUnits>>;
}

export interface HouseholdPlanArgs {
  readonly scope: 'me' | 'household';
  /** every current member, in member order, and the viewer's place in it */
  readonly memberKeys: readonly string[];
  readonly myIndex: number;
  readonly setting: SpendRuleSetting | null;
  /** the household's default bill weights per member key; null = the default is "mine only" */
  readonly billWeights: Readonly<Record<string, number>> | null;
  readonly inferred: HouseholdSetup;
  /** one entry per member in member order: a partner's rounded figure when they count, else null; the viewer's own entry is ignored */
  readonly others: readonly (MinorUnits | null)[];
  readonly joint: readonly JointAccountFacts[];
}

export interface HouseholdPlan {
  readonly joint: { readonly applied: JointLayShape; readonly without: JointLayShape } | null;
  readonly personalDelta: ((ownPersonalLeft: MinorUnits) => MinorUnits) | null;
  readonly resolved: ResolvedSpendRule;
}

/** One joint account's true figures in the household's currency, before the viewer's own records are laid beside them. */
export interface JointRaw {
  readonly id: string;
  readonly purpose: JointAccountFacts['purpose'];
  readonly spendable: boolean;
  readonly safetyNet?: boolean;
  readonly balance: MinorUnits;
  readonly monthIn: MinorUnits;
  readonly monthOut: MinorUnits;
  readonly carried: MinorUnits;
  readonly billsDueBeforeNextIn: MinorUnits;
  readonly paidInBy?: readonly MinorUnits[];
  /** the viewer's own net flow this month on this account, when it is not their pay-ins less their bill share of the money out (transfers are not month money) */
  readonly ownMonth?: MinorUnits;
}

/**
 * Adds what the viewer's own records already hold for each joint account: its balance as spending money (only an account whose use
 * counts it: everyday or mixed) and the viewer's own net flow this month (their pay-ins less their share of the money out, `myBill`
 * being their bill-split share between 0 and 1). The facts' slices are laid over these, so a joint account is never counted twice.
 */
export function jointFactsOf(
  raw: readonly JointRaw[],
  accounts: readonly { readonly id: string; readonly balance: MinorUnits; readonly use: { readonly kind: string } | null }[],
  myIndex: number,
  myBill: number,
): JointAccountFacts[] {
  return raw.map((j) => {
    const own = accounts.find((a) => a.id === j.id);
    const counted = own !== undefined && own.use !== null && (own.use.kind === 'everyday' || own.use.kind === 'mixed');
    const { ownMonth, ...rest } = j;
    return {
      ...rest,
      viewerBalance: counted ? own.balance : minorUnits(0),
      viewerOwnMonth: ownMonth ?? minorUnits((j.paidInBy?.[myIndex] ?? 0) - Math.round(j.monthOut * myBill)),
    };
  });
}

function layOf(s: JointSlices): JointLayShape {
  return { monthDelta: s.monthDelta, cashDelta: s.cashDelta, balances: Object.fromEntries(s.perAccount.map((p) => [p.id, p.cash])) };
}

export function householdPlan(a: HouseholdPlanArgs): HouseholdPlan {
  const resolved = resolveSpendRule(a.setting, a.memberKeys, a.billWeights, a.inferred);
  const n = a.memberKeys.length;
  const bw = a.billWeights;
  const billWeights = bw === null ? null : a.memberKeys.map((k) => bw[k] ?? 0);
  const joint =
    a.joint.length === 0
      ? null
      : { applied: layOf(jointSlices(a.joint, resolved.joint, billWeights, a.myIndex, n)), without: layOf(withoutJointSlices(a.joint)) };
  const pooled = a.scope === 'household' && resolved.personal.kind === 'shares' && a.others.some((o, i) => i !== a.myIndex && o !== null);
  const spend = resolved.personal;
  return {
    joint,
    personalDelta: pooled ? (own) => spendDelta(own, a.others, spend, a.myIndex) : null,
    resolved,
  };
}
