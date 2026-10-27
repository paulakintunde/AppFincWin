/**
 * Unspent money (05.1 S4; I35, I39, I40, D-22, D-26, D-30, D-31). Pure: no clock.
 *
 * D-22 (the definition of I40): unspent money is the user's confirmed figure plus only the unplanned change since the
 * anchor date. Money in adds; everyday spending, regular bills not already counted as still due at the anchor,
 * loan and debt payments and money put into savings or investments subtract; other money in or out moves it either
 * way. Bills already counted as still due at the anchor, and the everyday spending the app already held back as Erest
 * at the anchor, do not move it. Until Grow, envelope and savings-goal moves count as saved/invested (D-22 stand-in).
 * I35: a confirmed figure is used as given. D-30: a drifted figure stays the user's figure.
 * The engine exposes stale and drifted; screens decide when to re-ask (D-22).
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { MATCH_DAYS, UNSPENT_DRIFT_PERCENT_DIVISOR, UNSPENT_STALE_DAYS } from '../constants';
import { addDays, addMonthsClamped, addYearMonths, dayOfMonth, daysBetween, daysInYearMonth, yearMonthOf } from '../dates';
import { classifyLine, liveSeriesOf, seriesIndex, seriesOccurrences } from '../month/series';
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from '../month/settle';
import { erestOf } from '../month/thisMonth';
import type { IncomeProfile, UnspentAnchor, UnspentBreakdown, UnspentState, V3Line, V3Month, V3Series } from '../types';

const FN = 'unspent';

/** D-43, D-54: spending balance - bills still due - Erest; the fund and envelopes are already out of the spending balance. Profile (d): the bills over the horizon, no Erest (I39). May be negative. */
export function suggestedUnspent(input: {
  readonly asOf: string;
  readonly spending: MinorUnits;
  readonly billsDue: MinorUnits;
  readonly erest: MinorUnits;
  readonly profile: IncomeProfile | null;
  readonly series: readonly V3Series[];
}): MinorUnits {
  let bills = BigInt(input.billsDue);
  let erest = BigInt(input.erest);
  const p = input.profile;
  if (p !== null && p.variable === 'balance' && p.billsHorizonMonths !== null) {
    const to = addMonthsClamped(input.asOf, p.billsHorizonMonths);
    bills = 0n;
    for (const s of liveSeriesOf(input.series, input.asOf, 'bill')) {
      bills += BigInt(Math.abs(s.amount)) * BigInt(seriesOccurrences(s, input.asOf, to).length);
    }
    erest = 0n;
  }
  return minorFromBigInt(BigInt(input.spending) - bills - erest, FN);
}

export function rollForward(input: {
  readonly anchor: UnspentAnchor;
  readonly asOf: string;
  readonly months: readonly V3Month[];
  readonly series: readonly V3Series[];
  readonly e: MinorUnits | null;
}): { readonly value: MinorUnits; readonly breakdown: UnspentBreakdown; readonly rolled: boolean } {
  const { anchor, asOf } = input;
  const index = seriesIndex(input.series);
  const anchorMonth = yearMonthOf(anchor.at);
  const nextFirst = `${addYearMonths(anchorMonth, 1)}-01`;

  const all: V3Line[] = [];
  for (const m of input.months) for (const l of m.lines) if (l.status === 'paid') all.push(l);
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Everyday logged in the anchor month up to and including the anchor day: the base Erest was held back from.
  let loggedAtAnchor = 0n;
  for (const l of all) {
    if (l.date > anchor.at || yearMonthOf(l.date) !== anchorMonth) continue;
    const c = classifyLine(l, index);
    if (c === 'everyday') loggedAtAnchor += BigInt(Math.abs(l.amount));
    else if (c === 'refund') loggedAtAnchor -= BigInt(Math.abs(l.amount));
  }
  if (loggedAtAnchor < 0n) loggedAtAnchor = 0n;
  const planned =
    input.e === null
      ? 0n
      : BigInt(erestOf(input.e, minorFromBigInt(loggedAtAnchor, FN), dayOfMonth(anchor.at), daysInYearMonth(anchorMonth)));

  // Bills still due at the anchor: occurrences dated after it in the anchor month. `today = asOf` keeps an ended series'
  // occurrences from before today (D-41 end rule). Settled by the one matcher in month/settle.ts (M-02, D-51, D-56).
  const dueAtAnchor: Due[] = [];
  const bySeries = new Map<string, V3Series>();
  for (const s of liveSeriesOf(input.series, anchor.at, 'bill', asOf)) {
    bySeries.set(s.id, s);
    for (const date of seriesOccurrences(s, addDays(anchor.at, 1), nextFirst, asOf)) {
      dueAtAnchor.push({ seriesId: s.id, date, amount: s.amount });
    }
  }
  const candidates: PaidLine[] = [];
  for (const l of all) {
    if (l.date <= anchor.at || l.date > asOf || yearMonthOf(l.date) !== anchorMonth) continue;
    const c = classifyLine(l, index);
    if (c === 'recurring_bill' || (c === 'everyday' && l.seriesId === null)) candidates.push(toPaidLine(l));
  }
  const { usedLines } = settle(dueAtAnchor, candidates, (id) =>
    matchWindowDays((bySeries.get(id) as V3Series).cadence, MATCH_DAYS),
  );

  let inn = 0n;
  let bills = 0n;
  let loans = 0n;
  let invested = 0n;
  let other = 0n;
  let anchorMonthEveryday = 0n; // net of refunds, after the anchor, in the anchor month
  let laterEveryday = 0n; // net of refunds, later months

  for (const l of all) {
    if (l.date <= anchor.at || l.date > asOf) continue;
    const amt = BigInt(Math.abs(l.amount));
    const inAnchorMonth = yearMonthOf(l.date) === anchorMonth;
    if (usedLines.has(l.id)) continue; // already held back as a bill still due at the anchor
    switch (classifyLine(l, index)) {
      case 'recurring_income':
      case 'other_income_unconfirmed':
        inn += amt;
        break;
      case 'everyday':
        if (inAnchorMonth) anchorMonthEveryday += amt;
        else laterEveryday += amt;
        break;
      case 'refund':
        if (inAnchorMonth) anchorMonthEveryday -= amt;
        else laterEveryday -= amt;
        break;
      case 'recurring_bill':
        bills += amt;
        break;
      case 'debt_payment':
        loans += amt;
        break;
      case 'saving':
      case 'investing':
        invested += amt;
        break;
      case 'saving_withdrawal':
        invested -= amt;
        break;
      case 'other_in':
        other += amt;
        break;
      case 'other_out':
        other -= amt;
        break;
      default:
        break;
    }
  }

  const anchorExcess =
    anchorMonthEveryday > planned ? anchorMonthEveryday - planned : anchorMonthEveryday < 0n ? anchorMonthEveryday : 0n;
  const everyday = anchorExcess + laterEveryday;

  const breakdown: UnspentBreakdown = {
    in: minorFromBigInt(inn, FN),
    everyday: minorFromBigInt(everyday, FN),
    bills: minorFromBigInt(bills, FN),
    loans: minorFromBigInt(loans, FN),
    investedSaved: minorFromBigInt(invested, FN),
    other: minorFromBigInt(other, FN),
  };
  const change = inn - everyday - bills - loans - invested + other;
  return {
    value: minorFromBigInt(BigInt(anchor.amount) + change, FN),
    breakdown,
    rolled: inn !== 0n || everyday !== 0n || bills !== 0n || loans !== 0n || invested !== 0n || other !== 0n,
  };
}

const ZERO: UnspentBreakdown = {
  in: minorUnits(0),
  everyday: minorUnits(0),
  bills: minorUnits(0),
  loans: minorUnits(0),
  investedSaved: minorUnits(0),
  other: minorUnits(0),
};

/** I35 stale after 30 days; D-22/D-26 drifted by more than 10% or the per-currency amount. The value is never replaced (D-30). */
export function unspentState(input: {
  readonly anchor: UnspentAnchor | null;
  readonly asOf: string;
  readonly roll: { readonly value: MinorUnits; readonly breakdown: UnspentBreakdown; readonly rolled: boolean } | null;
  readonly suggested: MinorUnits;
  readonly driftThreshold: MinorUnits;
}): UnspentState | null {
  if (input.anchor === null) return null;
  const roll = input.roll ?? { value: input.anchor.amount, breakdown: ZERO, rolled: false };
  const diff = BigInt(roll.value) - BigInt(input.suggested);
  const abs = diff < 0n ? -diff : diff;
  const suggestedAbs = BigInt(Math.abs(input.suggested));
  const drifted = abs * BigInt(UNSPENT_DRIFT_PERCENT_DIVISOR) > suggestedAbs || abs > BigInt(input.driftThreshold);
  return {
    value: roll.value,
    anchor: input.anchor,
    rolled: roll.rolled,
    stale: daysBetween(input.anchor.at, input.asOf) > UNSPENT_STALE_DAYS,
    drifted,
    breakdown: roll.breakdown,
  };
}
