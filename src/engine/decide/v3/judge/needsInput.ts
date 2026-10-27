/**
 * UP §5.4, D-30, D-32 (05.1). The fixed needs-input rules; nothing else can ask the user for more.
 *  5.4.1 no confirmed pay series (D-41: ended with no end date is ended as of today),
 *        no income profile and no rough figures                                  -> no_income_figures
 *  5.4.2 unspent not confirmed and day one above this month's room               -> unspent_not_confirmed
 *  5.4.3 band >= 5, newest spending entry over 10 days old and the month below
 *        50% of the usual pace                                                   -> records_look_behind
 *  5.4.4 income swings and the pattern is not stated or confirmed (D-34)            -> income_pattern_unconfirmed
 *  5.4.5 variable or seasonal, and a month the purchase depends on has no expected
 *        income (D-35: fewer than 12 full months, no confirmed figure, or an empty
 *        season)                                                                  -> expected_income_needed
 *  5.4.6 money above what the records explain (D-50)                              -> unexplained_money_question
 *  5.4.7 an account with no stated use, or an unlinked emergency fund (D-54, D-62) -> account_use_question
 *  5.4.8 a past pay with no matching line and no answer (D-58)                    -> pay_arrival_question
 *  plus everyday_unknown (no everyday figure and no rough figures) and the purchase's own missing facts.
 * Rough figures alone satisfy 5.4.1 and give E (D-32). Drift alone is never needs-input (D-30); less money than
 * expected stays a notice, only more money than explained asks (D-50).
 * Result is unique and in MISSING_PRIORITY order (D-59); [] means the judge can answer.
 */
import { daysBetween } from '../dates';
import { MISSING_PRIORITY, NEEDS_INPUT_ENTRY_AGE_DAYS, NEEDS_INPUT_MIN_BAND, UNDER_LOGGED_PACE_PERCENT } from '../constants';
import { minorUnits } from '../../../money/types';
import { dependsOnMonths, expectedFor } from '../month/incomePattern';
import { classifyLine, liveSeriesOf, seriesIndex } from '../month/series';
import type { Funds, MissingCode, MonthModel, Purchase, V3Inputs } from '../types';

export interface NeedsInputContext {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly purchaseMissing: readonly MissingCode[];
}

function hasConfirmedIncome(inputs: V3Inputs): boolean {
  return liveSeriesOf(inputs.series, inputs.asOf, 'pay').length > 0;
}

function newestSpending(inputs: V3Inputs): string | null {
  const index = seriesIndex(inputs.series);
  let newest: string | null = null;
  for (const m of inputs.months) {
    for (const l of m.lines) {
      // L-09: a bill payment is not everyday spending, so it does not show the records are fresh.
      if (l.role === 'spending' && l.status === 'paid' && classifyLine(l, index) === 'everyday' && (newest === null || l.date > newest)) newest = l.date;
    }
  }
  return newest;
}

export function needsInput(ctx: NeedsInputContext): readonly MissingCode[] {
  const { inputs, month, funds, purchase } = ctx;
  const out = new Set<MissingCode>(ctx.purchaseMissing);

  if (!hasConfirmedIncome(inputs) && inputs.profile === null && inputs.rough === null) out.add('no_income_figures');
  if (month.e === null && inputs.rough === null) out.add('everyday_unknown');

  // D-54, D-62: an account with no stated use, or an emergency fund that sits in no known account.
  if ((funds.unstatedAccounts ?? []).length > 0 || funds.fundUnlinked === true) out.add('account_use_question');
  // D-58: a past pay with no matching line and no answer.
  if ((month.unseenPay ?? []).some((p) => p.arrived === null)) out.add('pay_arrival_question');
  // D-50: more money than the records explain, above the D-26 per-currency threshold.
  if (funds.unexplained !== undefined && funds.unexplained > inputs.thresholds.unspentDrift) out.add('unexplained_money_question');

  const pic = month.incomePicture;
  if (pic?.confirmNeeded) out.add('income_pattern_unconfirmed'); // D-34
  if (pic !== undefined && pic.treated !== 'steady') {
    // D-35: ask when any month the purchase depends on has no confirmed or record-based expected income.
    const months = dependsOnMonths(inputs.asOf, purchase?.schedule ?? null, purchase?.runningMonthly ?? minorUnits(0));
    if (months.some((ym) => expectedFor(pic, inputs.expectedIncome ?? [], ym) === null)) out.add('expected_income_needed');
  }

  if (purchase !== null) {
    if (funds.unspent === null && purchase.dayOne > Math.max(0, month.monthLeft) + Math.max(0, funds.ownEnvelope)) out.add('unspent_not_confirmed');

    if (purchase.band >= NEEDS_INPUT_MIN_BAND && month.e !== null) {
      const newest = newestSpending(inputs);
      const old = newest === null || daysBetween(newest, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS;
      const behind =
        BigInt(month.everydayLogged) * BigInt(month.daysInMonth) * 100n <
        BigInt(UNDER_LOGGED_PACE_PERCENT) * BigInt(month.e) * BigInt(month.day);
      if (old && behind) out.add('records_look_behind');
    }
  }

  return [...out].sort((a, b) => MISSING_PRIORITY.indexOf(a) - MISSING_PRIORITY.indexOf(b)); // D-59: owner priority order
}
