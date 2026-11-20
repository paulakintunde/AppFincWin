// PURE. 08.1-08 (CMP-F19, D-02, D-03, UX-21, CMP-F04): the household side of the one builder. Scope 'me' (the default, D-02) reads only
// the viewer's records and their share of shared lines; 'household' also pools each opted-in partner's one rounded figure and counts
// only the viewer's agreed share of the pool (owner 2026-11-20; engine/household/pool.ts). Never a partner's items, income, debts,
// goals or net (T-08.1-26): a partner reaches the inputs only as that one figure.
import { applyHouseholdMoney, prepare, type V3Household, type V3Inputs } from '@/engine/decide/v3';
import { householdDelta } from '@/engine/household';
import { monthPicture } from '@/engine/month';
import { minorUnits } from '@/engine/money';

/** One other member of the viewer's household, as Decide may see them. */
export interface HouseholdPartnerSource {
  /** The member key the screen resolves to a name (D-32); only ever returned in the caveat, never read for a figure. */
  readonly key: string;
  /** The household weight (the agreed split); used only for a partner who is counted. */
  readonly weight: number;
  /** Both opt-ins are on (08.1-03 partner_money_total ok). */
  readonly sharing: boolean;
  /** partner_money_total's rounded_left; null when none is published. */
  readonly roundedLeft: number | null;
  /** The figure's currency; a figure not in the viewer's home currency is never converted, so it is not counted. */
  readonly currency: string;
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

/** Lays the household into finished inputs. No household source (or a one-person household) returns the inputs untouched. */
export function withHouseholdScope(inputs: V3Inputs, hh: HouseholdScopeSource | undefined): V3Inputs {
  if (hh === undefined) return inputs;
  const pool = hh.scope === 'household' ? counted(hh, inputs.currency) : [];
  let out = inputs;
  if (pool.length > 0) {
    const own = monthPicture(prepare(inputs)).leftAfterPlans;
    const weights = [hh.myWeight, ...pool.map((p) => p.weight)];
    const figures = pool.map((p) => minorUnits(p.roundedLeft as number));
    out = applyHouseholdMoney(inputs, householdDelta(minorUnits(Number(own)), figures, weights, 0));
  }
  const notShared = hh.scope === 'household' ? hh.partners.filter((p) => !pool.includes(p)).map((p) => p.key) : [];
  const settleUp = hh.settleUp === undefined || hh.settleUp === null ? null : { lapsedAsPayer: hh.settleUp.lapsedAsPayer, owed: minorUnits(hh.settleUp.owed) };
  const household: V3Household = { scope: hh.scope, notShared, settleUp };
  return { ...out, household };
}
