/**
 * prepare once, judge per check (05.4-13, ENG-12). Everything that does not depend on the check (month model, base funds,
 * paid occurrences, pay caps, due drops, the open 90-day cash path, readiness) is built once in prepare(raw); judgeCheck
 * runs purchase -> cash -> judge for one check, so a key press does not rebuild the month. evaluate() is judgeCheck(prepare()).
 * Thin history prepares both readings (as given, and the thin months read as full) and judgeCheck keeps the stricter (D-42).
 * Pure: asOf comes from the inputs, no clock is read (I16).
 * The cash path takes the purchase through purchaseCashFlows, never purchaseFlows directly: a first payment dated today
 * is already inside dayOne and would land twice.
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { CASH_PATH_DAYS_V3, CODE_PRECEDENCE, MATCH_DAYS, PAY_MATCH_DAYS } from './constants';
import { applyPurchaseFlows, cashCheck, nextPayDate, openCashPath, type CashCheck, type OpenCashPath } from './cash/path';
import { addDays, addYearMonths, yearMonthOf } from './dates';
import { buildFunds } from './funds/build';
import { insteadFutures, type Futures } from './instead/futures';
import { readinessOf } from './readiness';
import { judge } from './judge/judge';
import { uncoveredIncomeMonths } from './judge/needsInput';
import { mayUseEmergency, withLiveEmergency } from './funds/emergency';
import { ownEnvelope } from './funds/envelopes';
import { buildPurchase, purchaseCashFlows } from './judge/purchase';
import { withRedatedRefunds } from './month/refunds';
import { dueDrops } from './month/dueDrops';
import { buildMonthModel } from './month/model';
import { incomeThisMonth, type IncomeInput } from './month/incomeProfile';
import { expectedFor } from './month/incomePattern';
import { liveSeriesOf, seriesOccurrences } from './month/series';
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from './month/settle';
import type { PlanCard } from './plan/planCard';
import type { QuotedCheck } from './plan/quoted';
import type { CheckV2, ConfidenceLevel, Funds, MonthModel, Purchase, ReadyBy, ReasonCode, Result, V3Inputs, YearMonth } from './types';

export interface Evaluation {
  readonly result: Result;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly planCard: PlanCard | null;
  readonly quoted: QuotedCheck;
  readonly cash: CashCheck;
  /** D-48: "What could I do instead?" attached straight away when the user said they cannot cover a volatile monthly payment; otherwise null. */
  readonly futures: Futures | null;
  /** 05.3-106: the future months the purchase depends on that have no expected income yet, in order; the first is the one the question names. */
  readonly uncoveredIncome?: readonly YearMonth[];
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

/**
 * D-35: for a variable or seasonal earner, the most pay that may land in each month of the cash path: the month's expected
 * income (a confirmed figure as given, else the records rule). This month's cap is what is still to arrive: expected minus
 * what has already arrived, never below 0. A month with no expected figure lands nothing (cautious; needsInput asks first).
 * null for a steady earner: every pay lands at its amount.
 */
function payCapsOf(inputs: V3Inputs, month: MonthModel): ReadonlyMap<string, MinorUnits> | null {
  const pic = month.incomePicture;
  if (pic === undefined || pic.treated === 'steady') return null;
  const currentYm = yearMonthOf(inputs.asOf);
  const incomeInput: IncomeInput = {
    asOf: inputs.asOf,
    current: inputs.months.find((m) => m.month === currentYm) ?? null,
    history: inputs.months.filter((m) => m.month !== currentYm),
    series: inputs.series,
    profile: inputs.profile,
    rough: inputs.rough,
    custom: inputs.custom,
    payArrivals: inputs.payArrivals ?? [],
  };
  const received = BigInt(incomeThisMonth(incomeInput).received);
  const caps = new Map<string, MinorUnits>();
  const lastYm = yearMonthOf(addDays(inputs.asOf, CASH_PATH_DAYS_V3));
  for (let i = 0, ym = currentYm; ym <= lastYm; i++, ym = addYearMonths(currentYm, i)) {
    const amount = BigInt(expectedFor(pic, inputs.expectedIncome ?? [], ym)?.amount ?? 0);
    const room = ym === currentYm ? (amount > received ? amount - received : 0n) : amount;
    caps.set(ym, minorUnits(Number(room)));
  }
  return caps;
}

/** One reading of the inputs, with everything that does not depend on the check. */
interface Reading {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly open: OpenCashPath;
  readonly payDate: string | null;
}

export interface Prepared {
  readonly inputs: V3Inputs;
  readonly readings: readonly Reading[];
  readonly readiness: ReturnType<typeof readinessOf>;
}

function readingOf(inputs: V3Inputs): Reading {
  const month = buildMonthModel(inputs);
  // the funds do not depend on the check except for the purchase's own envelope, which judgeReading swaps in
  const funds = buildFunds(inputs, month, null);
  const open = openCashPath({
    asOf: inputs.asOf,
    days: CASH_PATH_DAYS_V3,
    series: inputs.series,
    paidThisMonth: paidOccurrences(inputs),
    erest: month.erest,
    e: month.e ?? minorUnits(0),
    payCaps: payCapsOf(inputs, month),
    drops: dueDrops(inputs), // 05.3-64 (D-27, D-31, skips): the same rule as the month model and unspent
  });
  return { inputs, month, funds, open, payDate: nextPayDate(inputs.series, inputs.asOf) };
}

function judgeReading(r: Reading, check: CheckV2): Evaluation {
  const { inputs, month } = r;
  const pb = buildPurchase(check, { asOf: inputs.asOf, thresholds: inputs.thresholds, custom: inputs.custom });
  const funds: Funds = { ...r.funds, ownEnvelope: ownEnvelope(inputs.envelopes, check.envelopeId) };
  // D-63: only an emergency-marked purchase whose purpose may use the fund lets the cash check see the fund; everything
  // else keeps it out of reach (D-09, D-43a). An unlinked fund (D-62) is already subtracted from spending, so it is added
  // back here once.
  const fundForCash = pb.purchase !== null && mayUseEmergency(pb.purchase) ? (funds.emergency ?? 0) : 0;
  const path = applyPurchaseFlows(
    r.open,
    // D-54: spending money plus the purchase's own envelope; other put-aside money never cushions the check (the fund only per D-63).
    minorUnits(funds.spending + funds.ownEnvelope + fundForCash),
    pb.purchase ? purchaseCashFlows(pb.purchase, inputs.asOf, CASH_PATH_DAYS_V3) : []
  );
  const cash = cashCheck(path, r.payDate);
  const judged = judge({
    inputs,
    month,
    funds,
    purchase: pb.purchase,
    purchaseMissing: pb.missing,
    purchasePreview: pb.preview,
    purchaseFacts: pb.facts,
    purchaseReasons: pb.reasons,
    cash,
  });
  // D-46: say so when the expected-income cap lowered the pay in the 90-day path; last, after the judge's notices.
  const result: Result =
    path.capped === undefined ? judged : { ...judged, notices: [...judged.notices, { code: 'pay_capped_expected', values: { capped: path.capped } }] };
  // D-48: a declined cover is not_yet with the Instead futures attached at once. The user's own deposit rate is a UI choice
  // (05.3); the payment-stream comparison does not need it.
  const futures =
    pb.purchase !== null && result.reasons.includes('volatile_cover_declined')
      ? insteadFutures({ result, month, funds, purchase: pb.purchase, userRate: null, years: 1 })
      : null;
  return { result, month, funds, purchase: pb.purchase, planCard: pb.planCard, quoted: pb.quoted, cash, futures, uncoveredIncome: uncoveredIncomeMonths(inputs, month, pb.purchase) };
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

/**
 * The check-independent work, once. D-52: a not-ready result is not a verdict; consumers check readiness first.
 * Readiness is read from the inputs as given (never from the all-full reading) and never changes the code, the split or any figure.
 */
export function prepare(raw: V3Inputs): Prepared {
  // 05.2 D-11: one pre-pass so typical, thisMonth, incomePattern and unspent read the same months, and the fund is at its live balance
  const inputs = withLiveEmergency(withRedatedRefunds(raw));
  const ym = yearMonthOf(inputs.asOf);
  const thin = inputs.months.some((m) => m.month < ym && !m.full);
  const first = readingOf(inputs);
  const readings = thin ? [first, readingOf({ ...inputs, months: inputs.months.map((m) => (m.month < ym ? { ...m, full: true } : m)) })] : [first];
  return { inputs, readings, readiness: readinessOf(inputs, first.month) };
}

/** Per key press: purchase -> cash -> judge on each prepared reading, the stricter kept (D-42). */
export function judgeCheck(p: Prepared, check: CheckV2): Evaluation {
  const [first, second] = p.readings as readonly [Reading, Reading | undefined];
  const a = judgeReading(first, check);
  const chosen = second === undefined ? a : stricterOf(a, judgeReading(second, check));
  return { ...chosen, result: { ...chosen.result, readiness: p.readiness } };
}
