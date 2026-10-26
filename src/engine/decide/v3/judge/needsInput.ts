/**
 * UP §5.4, D-30, D-32 (05.1). The fixed needs-input rules; nothing else can ask the user for more.
 *  5.4.1 no confirmed pay series, no income profile and no rough figures        -> no_income_figures
 *  5.4.2 unspent not confirmed and day one above this month's room               -> unspent_not_confirmed
 *  5.4.3 band >= 5, newest spending entry over 10 days old and the month below
 *        50% of the usual pace                                                   -> records_look_behind
 *  plus everyday_unknown (no everyday figure and no rough figures) and the purchase's own missing facts.
 * Rough figures alone satisfy 5.4.1 and give E (D-32). Drift alone is never needs-input (D-30).
 * Result is unique and sorted; [] means the judge can answer.
 */
import { daysBetween } from '../dates';
import { NEEDS_INPUT_ENTRY_AGE_DAYS, NEEDS_INPUT_MIN_BAND, UNDER_LOGGED_PACE_PERCENT } from '../constants';
import type { Funds, MissingCode, MonthModel, Purchase, V3Inputs } from '../types';

export interface NeedsInputContext {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly purchaseMissing: readonly MissingCode[];
}

function hasConfirmedIncome(inputs: V3Inputs): boolean {
  return inputs.series.some((s) => {
    if (s.role !== 'pay' || !s.confirmed || s.status === 'dismissed') return false;
    if (s.status === 'ended') return s.endDate !== null && s.endDate >= inputs.asOf;
    return s.endDate === null || s.endDate >= inputs.asOf;
  });
}

function newestSpending(inputs: V3Inputs): string | null {
  let newest: string | null = null;
  for (const m of inputs.months) {
    for (const l of m.lines) {
      if (l.role === 'spending' && l.status === 'paid' && (newest === null || l.date > newest)) newest = l.date;
    }
  }
  return newest;
}

export function needsInput(ctx: NeedsInputContext): readonly MissingCode[] {
  const { inputs, month, funds, purchase } = ctx;
  const out = new Set<MissingCode>(ctx.purchaseMissing);

  if (!hasConfirmedIncome(inputs) && inputs.profile === null && inputs.rough === null) out.add('no_income_figures');
  if (month.e === null && inputs.rough === null) out.add('everyday_unknown');

  if (purchase !== null) {
    if (funds.unspent === null && purchase.dayOne > Math.max(0, month.monthLeft)) out.add('unspent_not_confirmed');

    if (purchase.band >= NEEDS_INPUT_MIN_BAND && month.e !== null) {
      const newest = newestSpending(inputs);
      const old = newest === null || daysBetween(newest, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS;
      const behind =
        BigInt(month.everydayLogged) * BigInt(month.daysInMonth) * 100n <
        BigInt(UNDER_LOGGED_PACE_PERCENT) * BigInt(month.e) * BigInt(month.day);
      if (old && behind) out.add('records_look_behind');
    }
  }

  return [...out].sort();
}
