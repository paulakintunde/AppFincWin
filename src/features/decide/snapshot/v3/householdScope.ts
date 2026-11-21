// PURE. 08.1-08 / 08.1-22 (CMP-F19, D-02, D-03, UX-21, CMP-F04): the household side of the one builder. Scope 'me' (the default, D-02)
// reads only the viewer's records and their share of shared lines; 'household' also pools each opted-in partner's one rounded figure
// under the group's spending rule (engine/household/spendRule.ts, pool.ts). A joint account is counted ONCE for the household and
// the viewer counts only their slice of it, in both scopes (engine/household/jointMoney.ts). Never a partner's items, income, debts,
// goals or net (T-08.1-26): a partner reaches the inputs only as that one figure, and joint money only as totals every member sees.
import { jointBackOf, layHouseholdMoney, prepare, type V3Household, type V3Inputs } from '@/engine/decide/v3';
import { householdPlan, inferSetup, jointFactsOf } from '@/engine/household';
import type { JointPurpose, JointRaw, SpendRuleSetting } from '@/engine/household';
import { monthPicture } from '@/engine/month';
import { minorUnits } from '@/engine/money';

/** One other member of the viewer's household, as Decide may see them. */
export interface HouseholdPartnerSource {
  /** The member key the screen resolves to a name (D-32); only ever returned in the caveat, never read for a figure. */
  readonly key: string;
  /** The household weight (the agreed bill split); used only for a partner who is counted. */
  readonly weight: number;
  /** Both opt-ins are on (08.1-03 partner_money_total ok). */
  readonly sharing: boolean;
  /** partner_money_total's rounded_left; null when none is published. */
  readonly roundedLeft: number | null;
  /** The figure's currency; a figure not in the viewer's home currency is never converted, so it is not counted. */
  readonly currency: string;
}

/**
 * 08.1-22: one joint account's true figures as the server returns them, in the account's own currency (the builder converts them to the
 * home currency). `balance` is the whole joint balance (every member's pay-ins in it), `monthIn` / `monthOut` this month's money paid in
 * and out so far, `paidInBy` each member's pay-ins this month by member key. Totals only: never a line (T-08.1-66).
 */
export interface JointAccountSource {
  readonly id: string;
  readonly currency: string;
  /** null = the group has not picked: counts as everyday */
  readonly purpose: JointPurpose | null;
  readonly spendable: boolean;
  /** this joint savings account is the household's shared safety net */
  readonly safetyNet?: boolean;
  readonly balance: number;
  readonly monthIn: number;
  readonly monthOut: number;
  readonly billsDueBeforeNextIn: number;
  readonly paidInBy: Readonly<Record<string, number>>;
}

export interface HouseholdScopeSource {
  /** The viewer's choice on the price step; 'me' on every check unless they pick Household (D-02). */
  readonly scope: 'me' | 'household';
  /** The viewer's member key: their own lines and shared lines are the only ones read (defence behind the database rules). */
  readonly viewerId: string;
  /** The viewer's household weight. */
  readonly myWeight: number;
  readonly partners: readonly HouseholdPartnerSource[];
  /** The viewer's settle-up as the payer: lapsed (08-11 settle_lapsed) and the total owed in home minor units; null = none. */
  readonly settleUp?: { readonly lapsedAsPayer: boolean; readonly owed: number } | null;
  /** 08.1-22: every member in member order (the order the household joined); absent = the viewer, then `partners`. */
  readonly memberKeys?: readonly string[];
  /** 08.1-22: the saved spending rule and setup; null / absent = none saved (the setup default applies, the setup inferred from the accounts). */
  readonly setting?: SpendRuleSetting | null;
  /** 08.1-22: the household's default bill weights per member key (what "Same as the bill split" follows); null = the default is "mine only". Absent = the member weights. */
  readonly billWeights?: Readonly<Record<string, number>> | null;
  /** 08.1-22: the household's joint accounts; absent or empty = none. */
  readonly joint?: readonly JointAccountSource[];
}

/** The viewer's own lines and shared lines only. A row with no creator (an old row) stays; nothing is dropped without a creator key. */
export function viewerRows<R extends object>(rows: readonly R[], viewerId: string): readonly R[] {
  return rows.filter((row) => {
    const r = row as { readonly is_shared?: boolean; readonly created_by?: string | null };
    return r.is_shared === true || r.created_by === undefined || r.created_by === null || r.created_by === viewerId;
  });
}

/** The partners whose money is counted: both opt-ins on, a figure published, in the viewer's currency. */
function counted(hh: HouseholdScopeSource, home: string): HouseholdPartnerSource[] {
  return hh.partners.filter((p) => p.sharing && p.roundedLeft !== null && p.currency === home);
}

/** A joint line as this reads it: the account, the day and the signed amount (the account's currency), and whether it is still pending. */
export interface JointRow {
  readonly account_id: string;
  readonly local_date: string;
  readonly original_amount: number;
  readonly status: string;
}

/**
 * 08.1-22: what is still to come out of each joint account, from the viewer's visible pending lines (shared outflows): the bills due
 * before the next pay-in (`today` up to but not including `nextIn`; a month ahead when no pay is known) and the pending money out
 * this month, which joins the money paid out so far as the month's planned outflow.
 */
export function jointWithPending(joint: readonly JointAccountSource[], rows: readonly JointRow[], today: string, nextIn: string | null): JointAccountSource[] {
  const month = today.slice(0, 7);
  return joint.map((j) => {
    let due = j.billsDueBeforeNextIn;
    let out = j.monthOut;
    for (const r of rows) {
      if (r.account_id !== j.id || r.status !== 'pending' || r.original_amount >= 0 || r.local_date < today) continue;
      const amount = -r.original_amount;
      if (nextIn === null || r.local_date < nextIn) due += amount;
      if (r.local_date.startsWith(month)) out += amount;
    }
    return { ...j, billsDueBeforeNextIn: due, monthOut: out };
  });
}

/** The joint accounts in the home currency; an account no rate converts (`toHome` gives null) counts nowhere. */
export function jointToHome(joint: readonly JointAccountSource[], keys: readonly string[], toHome: (amount: number, currency: string) => number | null): JointRaw[] {
  return joint.flatMap((j): JointRaw[] => {
    const balance = toHome(j.balance, j.currency);
    const monthIn = toHome(j.monthIn, j.currency);
    const monthOut = toHome(j.monthOut, j.currency);
    const due = toHome(j.billsDueBeforeNextIn, j.currency);
    if (balance === null || monthIn === null || monthOut === null || due === null) return [];
    const paid = keys.map((k) => toHome(j.paidInBy[k] ?? 0, j.currency) ?? 0);
    return [
      {
        id: j.id,
        purpose: j.purpose,
        spendable: j.spendable,
        ...(j.safetyNet === true ? { safetyNet: true } : {}),
        balance: minorUnits(balance),
        monthIn: minorUnits(monthIn),
        monthOut: minorUnits(monthOut),
        carried: minorUnits(balance - (monthIn - monthOut)),
        billsDueBeforeNextIn: minorUnits(due),
        paidInBy: paid.map(minorUnits),
      },
    ];
  });
}

/**
 * Lays the household into finished inputs. No household source returns the inputs untouched. `joint` is the household's joint accounts
 * in the home currency (the builder converts them); with none and no pool the inputs also come back untouched apart from the household facts.
 */
export function withHouseholdScope(inputs: V3Inputs, hh: HouseholdScopeSource | undefined, joint: readonly JointRaw[] = []): V3Inputs {
  if (hh === undefined) return inputs;
  const pool = hh.scope === 'household' ? counted(hh, inputs.currency) : [];
  const keys = hh.memberKeys ?? [hh.viewerId, ...hh.partners.map((p) => p.key)];
  const me = Math.max(0, keys.indexOf(hh.viewerId));
  const weightOf = new Map<string, number>([[hh.viewerId, hh.myWeight], ...hh.partners.map((p): [string, number] => [p.key, p.weight])]);
  const bill = hh.billWeights === undefined ? Object.fromEntries(keys.map((k) => [k, weightOf.get(k) ?? 0])) : hh.billWeights;
  const total = bill === null ? 0 : keys.reduce((s, k) => s + (bill[k] ?? 0), 0);
  const myBill = bill === null || total === 0 ? 1 / keys.length : (bill[hh.viewerId] ?? 0) / total;
  const accounts = inputs.accounts ?? [];
  const facts = jointFactsOf(joint, accounts, me, myBill);
  const plan = householdPlan({
    scope: hh.scope,
    memberKeys: keys,
    myIndex: me,
    setting: hh.setting ?? null,
    billWeights: bill,
    inferred: inferSetup({
      hasJoint: joint.length > 0,
      hasPersonalCash: accounts.some((a) => a.joint !== true && a.kind !== 'card' && a.noRate !== true),
      hasJointCash: joint.some((j) => j.purpose !== 'savings'),
    }),
    others: keys.map((k) => {
      const p = pool.find((x) => x.key === k);
      return k === hh.viewerId || p === undefined ? null : minorUnits(p.roundedLeft as number);
    }),
    joint: facts,
  });
  const out = layHouseholdMoney(inputs, plan, (i) => monthPicture(prepare(i)).leftAfterPlans);
  const notShared = hh.scope === 'household' ? hh.partners.filter((p) => !pool.includes(p)).map((p) => p.key) : [];
  const settleUp = hh.settleUp === undefined || hh.settleUp === null ? null : { lapsedAsPayer: hh.settleUp.lapsedAsPayer, owed: minorUnits(hh.settleUp.owed) };
  const household: V3Household = {
    scope: hh.scope,
    notShared,
    settleUp,
    ...(plan.joint === null ? {} : { jointBack: jointBackOf(plan.joint.applied, plan.joint.without) }),
    ...(plan.zeroShare === null ? {} : { zeroShare: plan.zeroShare }),
  };
  return { ...out, household };
}
