/**
 * The single v3 entry point (05.1). Home, the check and saved plans all call this through computeV3 (05.1-30); there is no second path.
 * month -> funds -> purchase -> cash -> judge. Pure: asOf comes from the inputs, no clock is read (I16).
 * The cash path takes the purchase through purchaseCashFlows, never purchaseFlows directly: a first payment dated today
 * is already inside dayOne and would land twice.
 */
import { minorUnits } from '../../money/types';
import { CASH_PATH_DAYS_V3, CODE_PRECEDENCE, MATCH_DAYS, PAY_MATCH_DAYS } from './constants';
import { buildCashPathV3, cashCheck, nextPayDate, type CashCheck } from './cash/path';
import { addDays, addYearMonths, yearMonthOf } from './dates';
import { buildFunds } from './funds/build';
import { judge } from './judge/judge';
import { buildPurchase, purchaseCashFlows } from './judge/purchase';
import { buildMonthModel } from './month/model';
import { liveSeriesOf, seriesOccurrences } from './month/series';
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from './month/settle';
import type { PlanCard } from './plan/planCard';
import type { QuotedCheck } from './plan/quoted';
import type { CheckV2, ConfidenceLevel, Funds, MonthModel, Purchase, ReadyBy, ReasonCode, Result, V3Inputs } from './types';

export interface Evaluation {
  readonly result: Result;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly planCard: PlanCard | null;
  readonly quoted: QuotedCheck;
  readonly cash: CashCheck;
}

/**
 * "seriesId|dueDate" of bill, debt and pay occurrences that a paid line already settled (H-01, H-02, M-02, D-51, D-56).
 * The cash path skips these, so a logged pay or bill is never counted a second time. Occurrences run from the first of
 * the month (the same set thisMonth uses), so a line pairs with the same due date in both places. Pay also looks across
 * the month boundary (W4): next month's occurrences that fall within PAY_MATCH_DAYS of the first of next month, and
 * last month's paid pay lines dated within PAY_MATCH_DAYS before this month's first day.
 */
function paidOccurrences(inputs: V3Inputs): ReadonlySet<string> {
  const ym = yearMonthOf(inputs.asOf);
  const current = inputs.months.find((m) => m.month === ym);
  const start = `${ym}-01`;
  const nextFirst = `${addYearMonths(ym, 1)}-01`;
  const lastMonth = inputs.months.find((m) => m.month === addYearMonths(ym, -1));
  const lines: PaidLine[] = (current?.lines ?? []).filter((l) => l.status === 'paid' && yearMonthOf(l.date) === ym).map(toPaidLine);
  const due: Due[] = [];
  const maxOf = new Map<string, { readonly cadence: V3Inputs['series'][number]['cadence']; readonly max: number }>();
  const paySeries = new Set<string>();
  for (const role of ['bill', 'debt_payment', 'pay'] as const) {
    const pay = role === 'pay';
    const to = pay ? addDays(nextFirst, PAY_MATCH_DAYS) : nextFirst;
    for (const s of liveSeriesOf(inputs.series, inputs.asOf, role)) {
      maxOf.set(s.id, { cadence: s.cadence, max: pay ? PAY_MATCH_DAYS : MATCH_DAYS });
      if (pay) paySeries.add(s.id);
      for (const d of seriesOccurrences(s, pay ? addDays(start, -PAY_MATCH_DAYS) : start, to, inputs.asOf)) due.push({ seriesId: s.id, date: d, amount: s.amount });
    }
  }
  for (const l of lastMonth?.lines ?? []) {
    if (l.status === 'paid' && l.seriesId !== null && paySeries.has(l.seriesId) && l.date >= addDays(start, -PAY_MATCH_DAYS)) {
      lines.push(toPaidLine(l));
    }
  }
  const { settled } = settle(due, lines, (id) => {
    const m = maxOf.get(id) as { readonly cadence: V3Inputs['series'][number]['cadence']; readonly max: number };
    return matchWindowDays(m.cadence, m.max);
  });
  return settled;
}

function evaluateOnce(inputs: V3Inputs, check: CheckV2): Evaluation {
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

const LEVEL_RANK: Readonly<Record<ConfidenceLevel, number>> = { rough: 0, fair: 1, firm: 2 };

/** A comparable key: a date, or the first of a month; null (never) sorts last. */
function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

/**
 * D-42: partially thin history never improves on reading the thin months as full; the stricter reading wins (I1).
 * The code, the split and every figure come from the stricter reading. The confidence is the lower of the two and the
 * reasons are the sorted union, so a thin month can never raise either.
 */
export function stricterOf(a: Evaluation, b: Evaluation): Evaluation {
  const ra = CODE_PRECEDENCE.indexOf(a.result.code);
  const rb = CODE_PRECEDENCE.indexOf(b.result.code);
  let pick = a;
  let bStricter = false;
  if (rb < ra) {
    pick = b;
    bStricter = true;
  } else if (rb === ra && a.result.code === 'not_yet' && readyKey(b.result.readyBy) > readyKey(a.result.readyBy)) {
    pick = b;
    bStricter = true;
  }
  const lowest = LEVEL_RANK[b.result.confidence.level] < LEVEL_RANK[a.result.confidence.level] ? b.result.confidence : a.result.confidence;
  const confidenceReasons = [...new Set([...a.result.confidence.reasons, ...b.result.confidence.reasons])].sort();
  const reasons: ReasonCode[] = [...new Set([...a.result.reasons, ...b.result.reasons, ...(bStricter ? (['thin_history_stricter'] as const) : [])])].sort();
  return { ...pick, result: { ...pick.result, reasons, confidence: { level: lowest.level, reasons: confidenceReasons } } };
}

export function evaluate(inputs: V3Inputs, check: CheckV2): Evaluation {
  const ym = yearMonthOf(inputs.asOf);
  const thin = inputs.months.some((m) => m.month < ym && !m.full);
  if (!thin) return evaluateOnce(inputs, check);
  const a = evaluateOnce(inputs, check);
  const b = evaluateOnce({ ...inputs, months: inputs.months.map((m) => (m.month < ym ? { ...m, full: true } : m)) }, check);
  return stricterOf(a, b);
}
