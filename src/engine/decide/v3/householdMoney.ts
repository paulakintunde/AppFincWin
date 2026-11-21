/**
 * 08.1-08 (CMP-F19, D-03): the household's money laid into a check's inputs. Pure. The caller works out the one signed figure
 * (engine/household/pool.ts: my agreed slice of the pool less my own money left) and this puts it where the answer reads money
 * left this month: one dated line in the current month, the cash on hand, the first spending account and the confirmed unspent
 * figure, all by the same amount, so the month figure and the earlier-money figure stay in step. A zero figure changes nothing.
 * Nothing here knows who the partner is or what they hold: only the one rounded total ever reached it (T-08.1-26).
 * 08.1-22: the same for joint accounts (applyJointMoney) and the whole step in one place (layHouseholdMoney).
 */
import { minorUnits } from '../../money/types';
import type { MinorUnits } from '../../money/types';
import type { AccountUse, JointLay, V3Account, V3Inputs, V3Line, V3Month } from './types';

/** The id of the line a household figure adds to the month. */
export const HOUSEHOLD_LINE_ID = 'household-pool';
/** The id of the line the viewer's joint-account month money adds (08.1-22). */
export const JOINT_LINE_ID = 'household-joint';

/** A joint account counts by the purpose the group set, not by the use one member gave it: the slice sits in spending money. */
const EVERYDAY: AccountUse = { kind: 'everyday' };

const isSpending = (a: V3Account): boolean => a.noRate !== true && (a.kind === undefined || a.kind === null || a.kind === 'checking' || a.kind === 'current');

/** One dated line in the current month: income reads like pay already in, spending like a payment. */
function monthLine(inputs: V3Inputs, id: string, delta: MinorUnits): V3Line {
  return {
    id,
    date: inputs.asOf,
    amount: minorUnits(Math.abs(delta)),
    role: delta > 0 ? 'income' : 'spending',
    status: 'paid',
    // more money this month reads like pay already in (the same series, so it is not mistaken for earlier money); less reads as spending
    seriesId: delta > 0 ? (inputs.series.find((s) => s.role === 'pay')?.id ?? null) : null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
  };
}

function withMonthLine(inputs: V3Inputs, line: V3Line): readonly V3Month[] {
  const ym = inputs.asOf.slice(0, 7);
  return inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, line] } : m));
}

export function applyHouseholdMoney(inputs: V3Inputs, delta: MinorUnits): V3Inputs {
  if (delta === 0) return inputs;
  const accounts = inputs.accounts;
  const first = accounts === undefined ? -1 : accounts.findIndex(isSpending);
  return {
    ...inputs,
    months: withMonthLine(inputs, monthLine(inputs, HOUSEHOLD_LINE_ID, delta)),
    balance: minorUnits(inputs.balance + delta),
    ...(accounts === undefined || first < 0 ? {} : { accounts: accounts.map((a, i) => (i === first ? { ...a, balance: minorUnits(a.balance + delta) } : a)) }),
    unspent: inputs.unspent === null ? null : { ...inputs.unspent, amount: minorUnits(inputs.unspent.amount + delta) },
  };
}

/**
 * 08.1-22 (CMP-F19, UX-21, owner 2026-11-20): the viewer's slice of the household's joint accounts laid over what the viewer's own
 * records hold. `balances` is each named joint account's balance as it should read now (the viewer's slice of the true balance); the
 * month line carries the change to this month's money (my slice less my own pay-ins and share of spending); the cash and the
 * confirmed unspent figure move by the change in cash. Accounts the lay does not name are untouched.
 */
export function applyJointMoney(inputs: V3Inputs, lay: JointLay): V3Inputs {
  const accounts = inputs.accounts;
  return {
    ...inputs,
    months: lay.monthDelta === 0 ? inputs.months : withMonthLine(inputs, monthLine(inputs, JOINT_LINE_ID, lay.monthDelta)),
    balance: minorUnits(inputs.balance + lay.cashDelta),
    ...(accounts === undefined ? {} : { accounts: accounts.map((a) => (a.id in lay.balances ? { ...a, balance: lay.balances[a.id] as MinorUnits, use: EVERYDAY } : a)) }),
    unspent: inputs.unspent === null ? null : { ...inputs.unspent, amount: minorUnits(inputs.unspent.amount + lay.cashDelta) },
  };
}

/** The lay that takes one lay back to another over the same records (used to return to personal money only for the partner figure). */
export function jointBackOf(applied: JointLay, without: JointLay): JointLay {
  return {
    monthDelta: minorUnits(without.monthDelta - applied.monthDelta),
    cashDelta: minorUnits(without.cashDelta - applied.cashDelta),
    balances: without.balances,
  };
}

export interface HouseholdMoneyPlan {
  /** the viewer's joint slice, and the same accounts with every slice zero (personal money only); null with no joint account */
  readonly joint: { readonly applied: JointLay; readonly without: JointLay } | null;
  /** my slice of the personal pool less my own personal money left; null when no pool applies */
  readonly personalDelta: ((ownPersonalLeft: MinorUnits) => MinorUnits) | null;
}

/**
 * Lays the household's money into the inputs in one place: the joint slice first, then the personal pool. My own personal money left
 * (what the pool counts) is read from the inputs with joint money taken out, so a joint account is never counted in the pool as well.
 * `leftOf` works out money left after plans for a set of inputs (the caller owns prepare, so this file stays free of the month model).
 */
export function layHouseholdMoney(inputs: V3Inputs, plan: HouseholdMoneyPlan, leftOf: (i: V3Inputs) => MinorUnits): V3Inputs {
  const moved = plan.joint === null ? inputs : applyJointMoney(inputs, plan.joint.applied);
  if (plan.personalDelta === null) return moved;
  const personal = plan.joint === null ? inputs : applyJointMoney(inputs, plan.joint.without);
  return applyHouseholdMoney(moved, plan.personalDelta(leftOf(personal)));
}
