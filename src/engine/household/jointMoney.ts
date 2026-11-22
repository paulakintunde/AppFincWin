// PURE. 08.1-22 (CMP-F19, UX-21, ENG-26, owner 2026-11-20): a joint account's money is counted ONCE for the household and each member
// counts only their slice of it. How an account counts depends on the purpose the group set (a joint account with none counts as
// everyday):
//   everyday = spendable: the whole balance, split by the group's rule;
//   bills    = only the money above the shared bills due before the next pay-in counts; if it is short, each member's bill-split part
//              of the gap comes out of their own money (a negative slice);
//   savings  = kept out like a locked goal (0 month, 0 cash), unless the group marked it spendable, then it counts as cash only;
//              when it is the shared safety net it is the net's saved amount, whole, once for both, and never spendable.
// Under "What each person brings" ('paidIn') money earned this month splits by what each person paid in; money carried from before
// splits equally. Slices always add up to the account's counted money, so two Fits answers never spend the same money twice.
import { minorUnits } from '../money/types';
import type { MinorUnits } from '../money/types';
import { sharedMoneyFor } from './sharedMoney';
import type { SpendRule } from './spendRule';

/** How joint money splits: by what each paid in this month ('paidIn'), or by one weight per member. */
export type JointSplit = 'paidIn' | Extract<SpendRule, { kind: 'shares' }>;

export type JointPurpose = 'bills' | 'savings' | 'everyday';

export interface JointAccountFacts {
  readonly id: string;
  /** null = the group has not picked yet: counts as everyday */
  readonly purpose: JointPurpose | null;
  /** a savings account the group marked spendable */
  readonly spendable: boolean;
  /** this joint savings account is the household's shared safety net */
  readonly safetyNet?: boolean;
  /** the true joint balance (every member's pay-ins included) */
  readonly balance: MinorUnits;
  /** this month's money paid in and the month's money out (paid, plus planned) */
  readonly monthIn: MinorUnits;
  readonly monthOut: MinorUnits;
  /** money in the account from before this month: the balance less this month's net so far (paid in less paid out) */
  readonly carried: MinorUnits;
  /** shared bills due from this account before the next pay-in */
  readonly billsDueBeforeNextIn: MinorUnits;
  /** this month's pay-ins per member, in member order; absent or all zero = counted equally */
  readonly paidInBy?: readonly MinorUnits[];
  /** what the viewer's own inputs hold today for this account: its visible balance in spending money, and the viewer's own net flow this month */
  readonly viewerBalance: MinorUnits;
  readonly viewerOwnMonth: MinorUnits;
}

export interface JointSlice {
  readonly id: string;
  readonly month: MinorUnits;
  readonly cash: MinorUnits;
}

export interface JointSlices {
  /** my slice of this month's joint money and of the joint cash, summed over the accounts */
  readonly month: MinorUnits;
  readonly cash: MinorUnits;
  /** the shared safety net's saved amount (joint savings marked as the net), null when there is none */
  readonly netSaved: MinorUnits | null;
  readonly perAccount: readonly JointSlice[];
  /** what to lay into the viewer's inputs: my slice less what the viewer's own records already hold */
  readonly monthDelta: MinorUnits;
  readonly cashDelta: MinorUnits;
}

const zero = minorUnits(0);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const equal = (n: number): number[] => Array.from({ length: n }, () => 1);

/** My part of `total` over `weights` (equal when none is positive). Parts of all members add to total. */
function part(total: number, weights: readonly number[], n: number, idx: number): number {
  if (total === 0) return 0;
  const w = weights.some((x) => x > 0) ? weights : equal(n);
  return sharedMoneyFor(minorUnits(total), w, idx);
}

function paidInWeights(a: JointAccountFacts, n: number): readonly number[] {
  return a.paidInBy !== undefined && a.paidInBy.length === n ? a.paidInBy.map((x) => Math.max(0, x)) : equal(n);
}

/**
 * My slice of `cashTotal` (carried money plus this month's) and of `monthTotal` under the split. `carried` is the part of cashTotal
 * that was there before this month: under bring it splits equally and the rest by what each paid in.
 */
function slice(cashTotal: number, monthTotal: number, carried: number, split: JointSplit, a: JointAccountFacts, n: number, idx: number): { month: number; cash: number } {
  if (split === 'paidIn') {
    const pw = paidInWeights(a, n);
    const carriedPart = Math.min(carried, cashTotal);
    return { month: part(monthTotal, pw, n, idx), cash: part(carriedPart, equal(n), n, idx) + part(cashTotal - carriedPart, pw, n, idx) };
  }
  return { month: part(monthTotal, split.weights, n, idx), cash: part(cashTotal, split.weights, n, idx) };
}

function oneAccount(a: JointAccountFacts, split: JointSplit, billWeights: readonly number[] | null, n: number, idx: number): { month: number; cash: number } {
  const purpose = a.purpose ?? 'everyday';
  if (purpose === 'savings') {
    if (a.safetyNet === true || !a.spendable) return { month: 0, cash: 0 };
    return { month: 0, cash: slice(a.balance, 0, a.balance, split, a, n, idx).cash };
  }
  if (purpose === 'bills') {
    const above = Math.max(0, a.balance - a.billsDueBeforeNextIn);
    const gap = Math.max(0, a.billsDueBeforeNextIn - a.balance);
    if (above === 0 && gap > 0) {
      const g = -part(gap, billWeights ?? [], n, idx);
      return { month: g, cash: g };
    }
    const s = slice(above, above, a.carried, split, a, n, idx);
    return { month: s.cash, cash: s.cash };
  }
  return slice(a.balance, a.monthIn - a.monthOut, a.carried, split, a, n, idx);
}

/**
 * @param split how joint money splits ('paidIn' for What each person brings, else the member weights)
 * @param billWeights the household's bill weights in member order (a short account's gap splits by them); null = equal
 * @param memberIndex the viewer's place in member order; memberCount how many members there are
 */
export function jointSlices(
  accounts: readonly JointAccountFacts[],
  split: JointSplit,
  billWeights: readonly number[] | null,
  memberIndex: number,
  memberCount: number,
): JointSlices {
  const perAccount = accounts.map((a): JointSlice => {
    const s = oneAccount(a, split, billWeights, memberCount, memberIndex);
    return { id: a.id, month: minorUnits(s.month), cash: minorUnits(s.cash) };
  });
  const nets = accounts.filter((a) => a.purpose === 'savings' && a.safetyNet === true);
  const month = sum(perAccount.map((p) => p.month));
  const cash = sum(perAccount.map((p) => p.cash));
  return {
    month: minorUnits(month),
    cash: minorUnits(cash),
    netSaved: nets.length === 0 ? null : minorUnits(sum(nets.map((a) => a.balance))),
    perAccount,
    monthDelta: minorUnits(month - sum(accounts.map((a) => a.viewerOwnMonth))),
    cashDelta: minorUnits(cash - sum(accounts.map((a) => a.viewerBalance))),
  };
}

/** The same shape with every slice zero: the viewer's inputs with joint money taken out (the published partner figure is personal only). */
export function withoutJointSlices(accounts: readonly JointAccountFacts[]): JointSlices {
  const nets = accounts.filter((a) => a.purpose === 'savings' && a.safetyNet === true);
  return {
    month: zero,
    cash: zero,
    netSaved: nets.length === 0 ? null : minorUnits(sum(nets.map((a) => a.balance))),
    perAccount: accounts.map((a) => ({ id: a.id, month: zero, cash: zero })),
    monthDelta: minorUnits(-sum(accounts.map((a) => a.viewerOwnMonth))),
    cashDelta: minorUnits(-sum(accounts.map((a) => a.viewerBalance))),
  };
}
