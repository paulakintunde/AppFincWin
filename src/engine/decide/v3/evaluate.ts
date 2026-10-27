/**
 * The single v3 entry point (05.1). Home, the check and saved plans all call this through computeV3 (05.1-30); there is no second path.
 * month -> funds -> purchase -> cash -> judge. Pure: asOf comes from the inputs, no clock is read (I16).
 * The cash path takes the purchase through purchaseCashFlows, never purchaseFlows directly: a first payment dated today
 * is already inside dayOne and would land twice.
 */
import { minorUnits } from '../../money/types';
import { CASH_PATH_DAYS_V3 } from './constants';
import { buildCashPathV3, cashCheck, nextPayDate, type CashCheck } from './cash/path';
import { addYearMonths, daysBetween, yearMonthOf } from './dates';
import { buildFunds } from './funds/build';
import { judge } from './judge/judge';
import { buildPurchase, purchaseCashFlows } from './judge/purchase';
import { buildMonthModel } from './month/model';
import { liveSeriesOf, seriesOccurrences } from './month/series';
import type { PlanCard } from './plan/planCard';
import type { QuotedCheck } from './plan/quoted';
import type { CheckV2, Funds, MonthModel, Purchase, Result, V3Inputs } from './types';

/** A paid line within this many days of a due date settles that occurrence (same window as thisMonth). */
const MATCH_DAYS = 3;

export interface Evaluation {
  readonly result: Result;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly planCard: PlanCard | null;
  readonly quoted: QuotedCheck;
  readonly cash: CashCheck;
}

/** "seriesId|dueDate" of bill and debt occurrences from asOf to month end that a paid line already settled. */
function paidOccurrences(inputs: V3Inputs): ReadonlySet<string> {
  const ym = yearMonthOf(inputs.asOf);
  const current = inputs.months.find((m) => m.month === ym);
  const out = new Set<string>();
  if (current === undefined) return out;
  const paid = current.lines.filter((l) => l.status === 'paid' && l.seriesId !== null && yearMonthOf(l.date) === ym);
  const used = new Array<boolean>(paid.length).fill(false);
  const nextFirst = `${addYearMonths(ym, 1)}-01`;
  for (const role of ['bill', 'debt_payment'] as const) {
    for (const s of liveSeriesOf(inputs.series, inputs.asOf, role)) {
      for (const d of seriesOccurrences(s, inputs.asOf, nextFirst)) {
        const hit = paid.findIndex((l, i) => !used[i] && l.seriesId === s.id && Math.abs(daysBetween(l.date, d)) <= MATCH_DAYS);
        if (hit >= 0) {
          used[hit] = true;
          out.add(`${s.id}|${d}`);
        }
      }
    }
  }
  return out;
}

export function evaluate(inputs: V3Inputs, check: CheckV2): Evaluation {
  const month = buildMonthModel(inputs);
  const pb = buildPurchase(check, { asOf: inputs.asOf, thresholds: inputs.thresholds, custom: inputs.custom });
  const funds = buildFunds(inputs, month, check.envelopeId);
  const path = buildCashPathV3({
    asOf: inputs.asOf,
    days: CASH_PATH_DAYS_V3,
    // D-54: spending money plus the purchase's own envelope; the fund and other put-aside money never cushion the check.
    opening: minorUnits(funds.spending + funds.ownEnvelope),
    series: inputs.series,
    paidThisMonth: paidOccurrences(inputs),
    erest: month.erest,
    e: month.e ?? minorUnits(0),
    extraOut: pb.purchase ? purchaseCashFlows(pb.purchase, inputs.asOf, CASH_PATH_DAYS_V3) : [],
  });
  const cash = cashCheck(path, nextPayDate(inputs.series, inputs.asOf));
  const result = judge({
    inputs,
    month,
    funds,
    purchase: pb.purchase,
    purchaseMissing: pb.missing,
    purchaseFacts: pb.facts,
    purchaseReasons: pb.reasons,
    cash,
  });
  return { result, month, funds, purchase: pb.purchase, planCard: pb.planCard, quoted: pb.quoted, cash };
}
