// 06.1-67 (H-6, G-10, DS-3, CS-5): where the answer's said lines sit. Pure: no React, no I/O. Nothing is dropped here; lines are
// only split between what shows at once and what opens one tap away.
import type { Line } from './sayResult';

/**
 * DS-3: the notices that may show above the verdict, the one that changes the answer most first. The one shown is the highest of
 * these that the answer carries; unsaved_changes (CO-D-113) shows only when none of the others is sent. Any other notice (month
 * warnings, tax, accounts without a use, and so on) never sits above the verdict: it opens under Why?.
 */
export const LEAD_NOTICE_ORDER: readonly string[] = Object.freeze([
  'month_heading_short',
  'typical_short',
  'pay_counted_missed',
  'pay_not_seen',
  'pay_gap',
  'income_volatile',
  'pay_capped_expected',
  'unexplained_money',
  'account_no_rate',
  'unsaved_changes',
]);

/** The place in LEAD_NOTICE_ORDER, or Infinity for a notice that never leads. */
const rankOf = (code: string): number => {
  const at = LEAD_NOTICE_ORDER.indexOf(code);
  return at === -1 ? Number.POSITIVE_INFINITY : at;
};

export interface SplitNotices {
  /** The one notice above the verdict, or null when there is none. */
  readonly lead: Line | null;
  /** The others, in the said order, for the Why? under the facts. */
  readonly rest: readonly Line[];
}

export function splitNotices(notices: readonly Line[]): SplitNotices {
  let at = -1;
  let best = Number.POSITIVE_INFINITY;
  notices.forEach((n, i) => {
    const rank = rankOf(n.code);
    if (rank < best) {
      best = rank;
      at = i;
    }
  });
  if (at === -1) return { lead: null, rest: notices };
  return { lead: notices[at] as Line, rest: notices.filter((_n, i) => i !== at) };
}

/** CS-5: what "Give it more to go on" lists. The More detail row's count and the sheet both read this. */
export interface GiveMoreList {
  readonly nextStep: Line | null;
  readonly readiness: readonly Line[];
  readonly missing: readonly Line[];
}

/** The number of lines the Give it more to go on sheet lists. */
export function giveMoreCount(list: GiveMoreList): number {
  return (list.nextStep === null ? 0 : 1) + list.readiness.length + list.missing.length;
}
