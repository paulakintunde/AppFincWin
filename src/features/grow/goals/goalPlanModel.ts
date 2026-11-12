// 06-22: the small pure helpers the goal screens share. All money maths is the engine's (engine/grow); this file only picks the
// anchor, reads a typed month and turns the engine's answers into the figures a screen shows. No React, no I/O.
import { goalPlanByDate, goalPlanByMonthly } from '@/engine/grow';
import { minorUnits } from '@/engine/money';
import { firstOfNextMonth } from '@/features/grow/calculators/typed/useCalcInput';

/** The date of the first deposit the plan counts: the first of next month, the same rule the Grow home uses. */
export function planAnchor(today: string): string {
  return firstOfNextMonth(today);
}

/** The day a monthly record falls on when the user does not pick one. */
export const DEFAULT_RECORD_DAY = 16;

/** The next date after `today` that falls on `day` (1 to 28). The first occurrence of the monthly record. */
export function nextRecordDate(today: string, day: number = DEFAULT_RECORD_DAY): string {
  const d = Math.min(28, Math.max(1, Math.trunc(day)));
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const dom = Number(today.slice(8, 10));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dom < d) return `${year}-${pad(month)}-${pad(d)}`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return `${ny}-${pad(nm)}-${pad(d)}`;
}

/** 'MM/YYYY', 'M/YYYY' or 'YYYY-MM' to 'YYYY-MM-01'. Null when it is not a real month. */
export function monthStartFromText(text: string): string | null {
  const s = text.trim();
  let y: number;
  let m: number;
  let hit = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(s);
  if (hit) {
    m = Number(hit[1]);
    y = Number(hit[2]);
  } else {
    hit = /^(\d{4})\s*[/.-]\s*(\d{1,2})$/.exec(s);
    if (!hit) return null;
    y = Number(hit[1]);
    m = Number(hit[2]);
  }
  if (m < 1 || m > 12 || y < 2000 || y > 2200) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

/** True for the one flagged safety-net row. Screens read the flag here so only set_safety_net ever writes it. */
export function isSafetyNetRow(row: { is_safety_net?: boolean }): boolean {
  return row.is_safety_net === true;
}

export interface MonthlyPlan {
  /** The first of the month the monthly amount reaches the target in, or null when it does not within 50 years. */
  reachesOn: string | null;
}

/** "Each month" edited: when does the target get reached. Null target or a zero amount reaches nothing. */
export function planFromMonthly(i: { saved: number; target: number | null; monthly: number; today: string }): MonthlyPlan {
  if (i.target === null || i.monthly <= 0) return { reachesOn: null };
  if (i.saved >= i.target) return { reachesOn: null };
  const r = goalPlanByMonthly({ have: minorUnits(i.saved), target: minorUnits(i.target), add: minorUnits(i.monthly), anchor: planAnchor(i.today) });
  return { reachesOn: r.reachesOn };
}

/** "By" edited: the amount needed each month, rounded UP to the cent, or null when the month is not after this month. */
export function planFromBy(i: { saved: number; target: number; byMonthStart: string; today: string }): number | null {
  const anchor = planAnchor(i.today);
  if (i.byMonthStart < anchor) return null;
  if (i.saved >= i.target) return 0;
  return goalPlanByDate({ have: minorUnits(i.saved), target: minorUnits(i.target), anchor, byDate: i.byMonthStart }).neededEachMonth;
}

/** 'YYYY-MM' to the last day of that month (the same rule as Decide's pots model; string maths only). */
function monthEnd(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map((p) => parseInt(p, 10));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * P4-CR-03: the `ready_by` a goal stores for a monthly amount. Decide's set-aside for a pot with a target reads only `ready_by`
 * (remaining over the whole months left), so it must follow the monthly amount Grow shows. The last day of the month the plan
 * reaches the target, the same rule the new-goal sheet uses on create; null when it is never reached (no target, no amount,
 * already reached, or over 50 years).
 */
export function readyByFromMonthly(i: { saved: number; target: number | null; monthly: number | null; today: string }): string | null {
  if (i.monthly === null) return null;
  const { reachesOn } = planFromMonthly({ saved: i.saved, target: i.target, monthly: i.monthly, today: i.today });
  return reachesOn === null ? null : monthEnd(reachesOn.slice(0, 7));
}

/**
 * P4-CR-03: the plan fields to store when a goal's target changes, so `monthly_amount` and `ready_by` still describe one plan.
 * The monthly amount the user chose is kept and the date follows it; with no monthly amount but a date, the amount follows the
 * date (rounded up, as the "Reaches by" edit does). No target: the date is cleared (a goal without a target has no date).
 * Returns only the fields that change.
 */
export function planFieldsForTarget(i: {
  saved: number;
  target: number | null;
  monthly: number | null;
  readyBy: string | null;
  today: string;
}): { ready_by?: string | null; monthly_amount?: number | null } {
  if (i.target === null) return i.readyBy === null ? {} : { ready_by: null };
  if (i.monthly !== null && i.monthly > 0) {
    const next = readyByFromMonthly({ saved: i.saved, target: i.target, monthly: i.monthly, today: i.today });
    return next === i.readyBy ? {} : { ready_by: next };
  }
  if (i.readyBy !== null) {
    const needed = planFromBy({ saved: i.saved, target: i.target, byMonthStart: `${i.readyBy.slice(0, 7)}-01`, today: i.today });
    if (needed !== null && needed > 0) return needed === i.monthly ? {} : { monthly_amount: needed };
  }
  return {};
}
