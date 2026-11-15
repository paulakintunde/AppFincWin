/**
 * The month picture (05.4 D-57, 05.5 ARC month-picture contract). Built by 06.1 to the 05.5 contract shape because 05.5 has not
 * started (06.1-RESEARCH "Month Picture"); 05.5 takes it over as is. Pure, integer minor units, no clock (asOf comes from the inputs).
 *
 * Three account figures for the stated date, each from one owner:
 * - balanceOn: the everyday money now, the spending balance prepare already builds (funds.spending: everyday and mixed accounts less
 *   the money set aside inside them; an account with no exchange rate counts 0, D-114);
 * - afterBillsBeforePayday: balanceOn less the bills and debt payments the cash path still takes up to and including the next
 *   payday (with no payday, up to the month's last day). The flows are the open path's own (openFlowsOf), so a bill already paid,
 *   paid by someone else or skipped is never taken twice;
 * - monthEnd: "left after the month's plans", always homeFigure(prepared) (pinned by a property test).
 * The unused overdraft sits on its own line and is never added into the three (D-57). After-bills and month-end are whole-picture
 * figures, never per account (bills carry no account id; 05.4-D55-RESEARCH).
 *
 * The card's bars (UX-30, UX-43: one kind of figure per series): the usual month and the low month from the month model, each as
 * comes in / goes out / left where goes out = comes in - left, and pastMonthBars for the back arrows, read from recorded lines only.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { homeFigure } from '../afterBuy';
import { daysInYearMonth, yearMonthOf } from '../dates';
import { unusedOverdraftOf } from '../overdraft';
import { openFlowsOf, type Prepared, type Reading } from '../prepare';
import type { LocalDate, MonthModel, V3Line, YearMonth } from '../types';
import { recordedIncomeByMonth } from './incomePattern';

const FN = 'month/picture';

/** One month as the card draws it: what came in, what went out, and what was left (in - out, signed). */
export interface MonthBar {
  readonly month: YearMonth;
  readonly comesIn: MinorUnits;
  readonly goesOut: MinorUnits;
  readonly left: MinorUnits;
}

export interface MonthPicture {
  readonly asOf: LocalDate;
  readonly balanceOn: MinorUnits;
  readonly afterBillsBeforePayday: MinorUnits;
  readonly monthEnd: MinorUnits;
  readonly unusedOverdraft: MinorUnits;
  /** The next payday on or after asOf; null when no pay is expected. */
  readonly payday: LocalDate | null;
  /** The usual month (typical income, typical money out, typical left); null when the month model has no typical month. */
  readonly usual: { readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } | null;
  /** The low month (UP 4.3) with its own month; null with no complete month to read it from. */
  readonly low: { readonly month: YearMonth; readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } | null;
}

type PictureInput = Pick<Prepared, 'inputs' | 'readings'>;

/** The reading homeFigure reads (the lower month figure; the first on a tie), so every figure on the card comes from one reading. */
function homeReading(p: PictureInput): Reading {
  let pick = p.readings[0] as Reading;
  for (const r of p.readings) if (r.month.monthLeft < pick.month.monthLeft) pick = r;
  return pick;
}

/** Each logged month's recorded income (the same eligibility rule as the typical month), whether or not the month is complete. */
function incomeByMonth(p: PictureInput): ReadonlyMap<string, bigint> {
  const { inputs } = p;
  return recordedIncomeByMonth({
    asOf: inputs.asOf,
    history: inputs.months.map((m) => (m.full ? m : { ...m, full: true })),
    series: inputs.series,
    profile: inputs.profile,
    custom: inputs.custom,
  });
}

const OUT_ROLES: ReadonlySet<V3Line['role']> = new Set(['spending', 'debt_payment', 'saved_invested', 'other_out']);

/** A bar from comes in and left: goes out is the difference, so the three always add up on the card. */
function bar(comesIn: bigint, left: bigint): { readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } {
  return { comesIn: minorFromBigInt(comesIn, FN), goesOut: minorFromBigInt(comesIn - left, FN), left: minorFromBigInt(left, FN) };
}

function lowOf(m: MonthModel, recorded: ReadonlyMap<string, bigint>): MonthPicture['low'] {
  const low = m.low;
  if (low === null) return null;
  // the low month's left was read with that month's own income for a variable or seasonal earner, else with the typical income
  const steady = m.incomePicture === undefined || m.incomePicture.treated === 'steady';
  const comesIn = steady ? BigInt(m.typicalIncome) : (recorded.get(low.month) as bigint);
  return { month: low.month, ...bar(comesIn, BigInt(low.left)) };
}

export function monthPicture(prepared: PictureInput): MonthPicture {
  const r = homeReading(prepared);
  const asOf = prepared.inputs.asOf;
  const ym = yearMonthOf(asOf);
  const payday = r.payDate;
  const until = payday ?? `${ym}-${String(daysInYearMonth(ym)).padStart(2, '0')}`;
  const balanceOn = r.funds.spending;
  let after = BigInt(balanceOn);
  for (const f of openFlowsOf(r)) if ((f.kind === 'bill' || f.kind === 'debt') && f.date <= until) after += BigInt(f.amount);
  const m = r.month;
  return {
    asOf,
    balanceOn,
    afterBillsBeforePayday: minorFromBigInt(after, FN),
    monthEnd: homeFigure(prepared),
    unusedOverdraft: unusedOverdraftOf(prepared.inputs.accounts),
    payday,
    usual: m.typicalLeft === null ? null : bar(BigInt(m.typicalIncome), BigInt(m.typicalLeft)),
    low: lowOf(m, incomeByMonth(prepared)),
  };
}

/**
 * The months before this one, oldest first, from recorded lines only (UX-43: one kind of figure): comes in is the recorded income
 * (the typical month's eligibility rule), goes out is the paid spending, debt payments, saving and other money out less refunds,
 * and left keeps its sign (a month below 0 draws its bar downward, UX-30). Moves between own accounts and envelopes are neither.
 */
export function pastMonthBars(prepared: PictureInput): readonly MonthBar[] {
  const ym = yearMonthOf(prepared.inputs.asOf);
  const recorded = incomeByMonth(prepared);
  return prepared.inputs.months
    .filter((m) => m.month < ym)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((m) => {
      let out = 0n;
      for (const l of m.lines) {
        if (l.status !== 'paid') continue;
        const amount = BigInt(Math.abs(l.amount));
        if (OUT_ROLES.has(l.role)) out += amount;
        else if (l.role === 'refund') out -= amount;
      }
      const comesIn = recorded.get(m.month) as bigint; // every month before this one is read
      return { month: m.month, comesIn: minorFromBigInt(comesIn, FN), goesOut: minorFromBigInt(out, FN), left: minorFromBigInt(comesIn - out, FN) };
    });
}
