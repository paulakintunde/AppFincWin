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
import { carriedOverdraft, homeFigure, openingBalance, rebased, withCarried } from './afterBuy';
import { maxCheckPrice } from './bandEdges';
import { CASH_PATH_DAYS_V3, CODE_PRECEDENCE, MATCH_DAYS, PAY_MATCH_DAYS } from './constants';
import { mergeConfidence } from './confidence/reasons';
import {
  applyPurchaseFlows,
  asOutflow,
  cashCheck,
  nextPayDate,
  openCashFlows,
  openCashPath,
  payDatesIn,
  withNet,
  type CashCheck,
  type DatedFlow,
  type LabelledFlow,
  type OpenCashPath,
  type OpenCashPathInput,
} from './cash/path';
import { debtOutflows, debtsInMonth, debtsNotRecorded, dueDayFacts, type DebtFlow, type DebtOutflows } from './debts';
import { essentialCosts, essentialSpendingOf } from './essentialCosts';
import { resolveSafetyNet, type ResolvedNet } from './safetyNet';
import { overdraftFloor } from './overdraft';
import { addDays, addYearMonths, yearMonthOf } from './dates';
import { buildFunds } from './funds/build';
import { insteadFutures, type Futures } from './instead/futures';
import { readinessOf } from './readiness';
import { judge, type BorrowingCtx } from './judge/judge';
import { uncoveredIncomeMonths } from './judge/needsInput';
import { withLiveEmergency } from './funds/emergency';
import { ownEnvelope } from './funds/envelopes';
import { buildPurchase, purchaseCashFlowsLabelled } from './judge/purchase';
import { purchaseDateOf } from './fullCost/purchaseDate';
import { replacesEffect, replacesFlowsLabelled, type ReplacesEffect } from './fullCost/replaces';
import { withRedatedRefunds } from './month/refunds';
import { recordsSynced } from './month/freshness';
import { dueDrops } from './month/dueDrops';
import { buildMonthModel } from './month/model';
import { historyPay, type HistoryPay } from './month/historyPay';
import { billsHeldTotal, cappedSpare, confirmedUnspent, savingTransferFlows, spareInAccount } from './moneySource';
import { incomeThisMonth, type IncomeInput } from './month/incomeProfile';
import { expectedFor } from './month/incomePattern';
import { liveSeriesOf, seriesOccurrences } from './month/series';
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from './month/settle';
import { caveatsFor } from './caveats';
import { freeHelpFacts } from './help/freeHelp';
import type { PlanCard } from './plan/planCard';
import type { QuotedCheck } from './plan/quoted';
import type { CheckV2, Fact, Funds, MonthModel, Notice, Purchase, ReadyBy, ReasonCode, Result, V3Account, V3Inputs, YearMonth } from './types';

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
  /** 05.4 FIN-01 (D-35): the safety net in force: protection, size (the starter when none is set), saved, protected floor, state. */
  readonly net?: ResolvedNet;
  /** 05.4 D-56: the spare money the answer was judged against (the confirmed figure capped at the everyday accounts at month end). */
  readonly spare?: MinorUnits | null;
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
 * 05.4 D-67: "seriesId|dueDate" of this month's regular saving / investing occurrences that a logged transfer already made, so the
 * cash path does not take them a second time (the everyday balance already shows them). The candidates are this month's paid
 * lines linked to a saving or investing series, or saved_invested lines with no link (matched by amount, D-56); bills never
 * compete for them (a separate settle, so no bill pairing moves).
 */
function savedOccurrences(inputs: V3Inputs): ReadonlySet<string> {
  const ym = yearMonthOf(inputs.asOf);
  const current = inputs.months.find((m) => m.month === ym);
  const start = `${ym}-01`;
  const nextFirst = `${addYearMonths(ym, 1)}-01`;
  const due: Due[] = [];
  const cadenceOf = new Map<string, V3Inputs['series'][number]['cadence']>();
  for (const role of ['saving', 'investing'] as const) {
    for (const s of liveSeriesOf(inputs.series, inputs.asOf, role)) {
      cadenceOf.set(s.id, s.cadence);
      for (const d of seriesOccurrences(s, start, nextFirst, inputs.asOf)) due.push({ seriesId: s.id, date: d, amount: s.amount });
    }
  }
  const lines: PaidLine[] = (current?.lines ?? [])
    .filter((l) => l.status === 'paid' && yearMonthOf(l.date) === ym && (l.seriesId === null ? l.role === 'saved_invested' : cadenceOf.has(l.seriesId)))
    .map(toPaidLine);
  const { settled } = settle(due, lines, (id) => matchWindowDays(cadenceOf.get(id) as V3Inputs['series'][number]['cadence'], MATCH_DAYS));
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
    typedEstimates: inputs.typedEstimates,
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
export interface Reading {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly open: OpenCashPath;
  readonly payDate: string | null;
  /** 05.4 FIN-03: minus the overdraft limits (D-28: no limit = 0), and the pay dates inside the path (D-36, D-37). */
  readonly floor: MinorUnits;
  readonly paydays: readonly string[];
  /** 05.4 FIN-01 (D-35): the safety net in force, with its starter from essential costs (ARC-07). */
  readonly net: ResolvedNet;
  /** 05.4 D-52: pay expected from history (null when the rule does not apply). */
  readonly hp: HistoryPay | null;
  /** 05.4 D-56: what the everyday accounts are expected to hold at month end with no purchase (D-67: after the regular saving still to move); spare money is capped at it. */
  readonly spareInAccount: MinorUnits;
  /** 05.4 FIN-04 (DB-02): the minimums counted as due tomorrow because no due day is set. */
  readonly assumed: DebtOutflows['assumed'];
  /** 05.4 BO-05 (05.4-27): what the open path settled and took for each debt, so what a purchase replaces gives back only what was taken (drops are read again from the inputs: a function is never kept in a Reading). */
  readonly paid: ReadonlySet<string>;
  readonly debtFlows: readonly DebtFlow[];
}

export interface Prepared {
  readonly inputs: V3Inputs;
  readonly readings: readonly Reading[];
  readonly readiness: ReturnType<typeof readinessOf>;
  /** 05.4 ENG-14: a new month with no records yet is judged on recently synced records (month/freshness.ts). */
  readonly recordsSynced: boolean;
  /** 05.4 FIN-25: the months as given hold no complete month before this one. */
  readonly noFullMonth: boolean;
  /** 05.4 ENG-17 (D-114): the ids of the accounts with no exchange rate, in input order; counted as 0 and named by notices. */
  readonly unrated: readonly string[];
}

/** The open 90-day path's input for one reading of the inputs (built: the reading's month model), with the parts readingOf keeps. */
function openInputOf(inputs: V3Inputs, built: MonthModel): { readonly input: OpenCashPathInput; readonly hp: HistoryPay | null; readonly paid: ReadonlySet<string>; readonly debts: DebtOutflows } {
  // 05.4 D-52: an irregular earner with no pay series expects pay on the usual payday at the low-month amount.
  const hp = historyPay(inputs);
  const histDates = hp?.dates ?? [];
  const paid = paidOccurrences(inputs);
  // 05.4 D-67: the regular saving / investing transfers leave the everyday account everywhere: the open path takes them, so the
  // main cash path, the month-end figure (spareInAccount, the D-56 cap) and the account-only move-by path (D-58) all do.
  const savings = savingTransferFlows(inputs.series, savedOccurrences(inputs), inputs.asOf, CASH_PATH_DAYS_V3);
  // 05.4 FIN-04: card and loan minimums on their due dates, each once (a minimum paid through a series lands through it).
  const ym = yearMonthOf(inputs.asOf);
  const debts = debtOutflows(inputs, inputs.months.find((m) => m.month === ym)?.lines ?? [], CASH_PATH_DAYS_V3);
  const drops = dueDrops(inputs);
  const input: OpenCashPathInput = {
    asOf: inputs.asOf,
    days: CASH_PATH_DAYS_V3,
    series: inputs.series,
    paidThisMonth: paid,
    erest: built.erest,
    e: built.e ?? minorUnits(0),
    payCaps: payCapsOf(inputs, built),
    drops, // 05.3-64 (D-27, D-31, skips): the same rule as the month model and unspent
    extraPays: histDates.map((date) => ({ date, amount: (hp as HistoryPay).amount })),
    savings,
    debts: debts.flows,
  };
  return { input, hp, paid, debts };
}

/**
 * 06.1 UX-38, CO-D-57: the labelled flows the reading's open path sums (cash/path.ts openCashFlows over the same input readingOf
 * built it from), read again from the reading's inputs: a reading keeps no function, and the month model's withCarried changes
 * only the month figure and its notices, never the spread or the pay caps.
 */
export function openFlowsOf(r: Reading): readonly LabelledFlow[] {
  return openCashFlows(openInputOf(r.inputs, r.month).input).flows;
}

function readingOf(inputs: V3Inputs): Reading {
  const built = buildMonthModel(inputs);
  // the funds do not depend on the check except for the purchase's own envelope, which judgeReading swaps in
  const funds = buildFunds(inputs, built, null);
  const { input, hp, paid, debts } = openInputOf(inputs, built);
  const histDates = hp?.dates ?? [];
  const ym = yearMonthOf(inputs.asOf);
  const open = openCashPath(input);
  // 05.4 D-86 (FIN-09b): an overdraft carried into the month is paid back from this month first; every use of the month reads it.
  const atMonthEnd = spareInAccount(open, funds.spending);
  const month = withCarried(built, carriedOverdraft(openingBalance(funds.spending, inputs.months.find((m) => m.month === ym)?.lines ?? [], ym, debts.paidUnrecorded)));
  // history pay exists only with no live pay series, so the two never both give a date: the first history date, else the series'.
  const payDate = histDates[0] ?? nextPayDate(inputs.series, inputs.asOf);
  return {
    inputs,
    month,
    funds,
    open,
    payDate,
    floor: overdraftFloor(inputs.accounts),
    paydays: [...new Set([...payDatesIn(inputs.series, inputs.asOf, CASH_PATH_DAYS_V3), ...histDates])].sort(),
    net: resolveSafetyNet(inputs, essentialCosts(month, debtsInMonth(inputs.debts, inputs.series, inputs.asOf), essentialSpendingOf(inputs, month))), // D-51: a minimum counted once
    hp,
    spareInAccount: atMonthEnd,
    assumed: debts.assumed,
    paid,
    debtFlows: debts.flows,
  };
}

/** 05.4 BO-05 (05.4-27): what the reading gives what a purchase replaces. */
function replacesOf(r: Reading, check: CheckV2, buyDate: string): ReplacesEffect | null {
  return replacesEffect(
    check.replaces,
    { asOf: r.inputs.asOf, days: CASH_PATH_DAYS_V3, series: r.inputs.series, paid: r.paid, drops: dueDrops(r.inputs), debts: r.inputs.debts, debtFlows: r.debtFlows, month: r.month },
    buyDate
  );
}

/**
 * 05.4 BO-05 (D-104 rule accepted 2026-11-04): a yearly or every-3-month bill that stops before its due date is not held back any more,
 * so its hold-back returns to the spare money it came off.
 */
function withoutStoppedHolds(funds: Funds, stops: ReadonlyMap<string, string>): Funds {
  const held = funds.billsHeld;
  if (held === undefined || stops.size === 0) return funds;
  const gone = held.parts.filter((b) => {
    const stop = stops.get(b.seriesId);
    return stop !== undefined && stop < b.dueDate;
  });
  if (gone.length === 0) return funds;
  const back = gone.reduce((t, b) => t + b.holdBack, 0);
  const parts = held.parts.filter((b) => !gone.includes(b));
  const unspent = funds.unspent === null ? null : { ...funds.unspent, available: minorUnits((confirmedUnspent(funds) as MinorUnits) + back) };
  return { ...funds, unspent, billsHeld: { total: minorUnits(held.total - back), parts } };
}

/** Options a caller inside the engine can give one judgement (05.4 BO-05 save-for-it). */
export interface JudgeOpts {
  /** D-108: money set aside for the item in kept savings, already capped at what those accounts hold; counted like the item's own envelope. */
  readonly savedFor?: number;
}

/**
 * The purchase side of one judgement on one reading: the purchase (less a sale netted against day one), what it replaces, the funds,
 * the opening balance and the labelled dated flows the path takes. 06.1 UX-38: judgeReading and the dated list (cashTimeline via
 * timelineOf) both read this one function, so the list's flows are the path's flows.
 */
function purchaseSideOf(r: Reading, check: CheckV2, opts: JudgeOpts) {
  const inputs0 = r.inputs;
  const pb0 = buildPurchase(check, {
    asOf: inputs0.asOf,
    thresholds: inputs0.thresholds,
    custom: inputs0.custom,
    region: { country: inputs0.region, subdivision: inputs0.regionSubdivision ?? null }, // 05.4 FIN-27
    maxPrice: maxCheckPrice(inputs0.currency), // 05.4 ENG-15 (D-109)
  });
  // 05.4 BO-05 (05.4-27): what the purchase replaces. A sale arriving by the purchase date lowers the day-one need (SO-01; any part
  // above it arrives on the path); a later sale counts only toward the ready date and on the path from its date (SO-02); the costs
  // that stop and the debt payments the sale ends come back on their dates; the debts after the sale are the ones judged (D-102).
  const buyDate0 = purchaseDateOf(check, inputs0.asOf);
  const rep = replacesOf(r, check, buyDate0);
  const inputs: V3Inputs = rep === null || rep.debts === inputs0.debts ? inputs0 : { ...inputs0, debts: rep.debts };
  const p0 = pb0.purchase;
  const netted = rep === null || p0 === null ? 0 : Math.min(p0.dayOne, rep.saleNow);
  const pb =
    rep === null
      ? pb0
      : { ...pb0, purchase: p0 === null || netted === 0 ? p0 : { ...p0, dayOne: minorUnits(p0.dayOne - netted) }, facts: [...pb0.facts, ...rep.facts] };
  const repFlows: LabelledFlow[] = rep === null ? [] : replacesFlowsLabelled(rep, netted);
  const funds1 = rep === null ? r.funds : withoutStoppedHolds(r.funds, rep.heldStops);
  const savedFor = opts.savedFor ?? 0;
  const funds: Funds = { ...funds1, ownEnvelope: minorUnits(ownEnvelope(inputs.envelopes, check.envelopeId) + savedFor) };
  // D-54: spending money plus the purchase's own envelope; other put-aside money never cushions the check. 05.4 D-35 (retires
  // D-63's purpose gate): money saved above the net's size is spare and counts; the protected part only lends when the path
  // would otherwise fail (withNet), whatever the purchase's purpose (D-41, D-49).
  const opening = minorUnits(funds.spending + funds.ownEnvelope + r.net.aboveSize);
  // 05.4 BO-05 / D-42 (05.4-26): the up-front money leaves on the purchase date; running costs fall on their own dates.
  const purchaseDate = purchaseDateOf(check, inputs.asOf);
  const labelled = [...(pb.purchase ? purchaseCashFlowsLabelled(pb.purchase, inputs.asOf, CASH_PATH_DAYS_V3, purchaseDate) : []), ...repFlows];
  return { inputs, pb, rep, funds, savedFor, opening, purchaseDate, labelled };
}

function judgeReading(r: Reading, check: CheckV2, opts: JudgeOpts): Evaluation {
  const { month, net } = r;
  const { inputs, pb, rep, funds, savedFor, opening, purchaseDate, labelled } = purchaseSideOf(r, check, opts);
  const flows: DatedFlow[] = labelled.map(asOutflow);
  const path = applyPurchaseFlows(r.open, opening, flows);
  // 05.4 D-56 / D-58: the everyday accounts alone (no money above the net's size), with the purchase; the regular saving transfers
  // are already in the open path (D-67), so they are taken once here as on the main path.
  const account = { spareInAccount: r.spareInAccount, withPurchase: applyPurchaseFlows(r.open, minorUnits(funds.spending + funds.ownEnvelope), flows) };
  const cash = withNet(cashCheck(path, r.payDate, r.floor), path, () => applyPurchaseFlows(r.open, opening, []), net.usable);
  // 05.4 FIN-03 (D-36): the same open path with no purchase flows gives the cost without it; only needed with an overdraft.
  const overdraft = { floor: r.floor, withPurchase: path, withoutPurchase: r.floor < 0 ? applyPurchaseFlows(r.open, opening, []) : null, paydays: r.paydays };
  const borrowing = borrowingOf(r, check, pb.purchase, pb.quoted, opts);
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
    overdraft,
    net,
    account,
    borrowing,
    purchaseDate,
    ...(rep === null ? {} : { replaces: { freed: rep.freed, showsUsual: rep.showsUsual, saleLater: rep.saleLater } }),
    ...(savedFor > 0 ? { savedFor } : {}),
  });
  // D-52: pay expected from history says so, after the judge's notices. D-46: say so when the expected-income cap lowered the
  // pay in the 90-day path; last.
  const extra: Notice[] = [];
  if (r.hp !== null && r.hp.amount > 0) extra.push({ code: 'pay_expected_from_history', values: { amount: r.hp.amount, day: r.hp.day, months: r.hp.months } });
  if (path.capped !== undefined) extra.push({ code: 'pay_capped_expected', values: { capped: path.capped } });
  // 05.4 FIN-04 (DB-02): a minimum with no due day is counted as due tomorrow; the answer says so, as a reason and as a fact.
  const assumed = judged.code === 'needs_input' ? [] : r.assumed;
  const dated: Result = assumed.length === 0 ? judged : { ...judged, reasons: [...judged.reasons, 'debt_due_day_assumed'], facts: [...judged.facts, ...dueDayFacts(assumed)] };
  const result: Result = extra.length === 0 ? dated : { ...dated, notices: [...dated.notices, ...extra] };
  // D-48: a declined cover is not_yet with the Instead futures attached at once. The user's own deposit rate is a UI choice
  // (05.3); the payment-stream comparison does not need it.
  const futures =
    pb.purchase !== null && result.reasons.includes('volatile_cover_declined')
      ? insteadFutures({ result, month, funds, purchase: pb.purchase, userRate: null, years: 1, check })
      : null;
  return { result, month, funds, purchase: pb.purchase, planCard: pb.planCard, quoted: pb.quoted, cash, futures, uncoveredIncome: uncoveredIncomeMonths(inputs, month, pb.purchase), net, spare: cappedSpare(confirmedUnspent(funds), r.spareInAccount, billsHeldTotal(funds)) };
}

/**
 * 05.4 FIN-05 (05.4-22): what the plan rule needs of a plan: the same purchase judged as paid once on this same reading (the cash
 * route; no second prepare), the plan's rate (typed, else implied by a quote, else unknown) and whether it is a home loan (D-39c).
 * null for a one-off, or a plan with no schedule yet (it asks first).
 */
function borrowingOf(r: Reading, check: CheckV2, purchase: Purchase | null, quoted: QuotedCheck, opts: JudgeOpts): BorrowingCtx | null {
  if (check.pay.mode !== 'plan' || purchase === null || purchase.schedule === null) return null;
  const implied = quoted.kind === 'from_quote' ? quoted.impliedApr : null;
  const apr = check.pay.apr ?? implied;
  return { cash: judgeReading(r, { ...check, pay: { mode: 'once' } }, opts).result, apr, housing: check.pay.housing === true };
}

/** A comparable key: a date, or the first of a month; null (never) sorts last. */
function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

/**
 * D-42: partially thin history never improves on reading the thin months as full; the stricter reading wins (I1).
 * The code, the split and every figure come from the stricter reading, compared by CODE_PRECEDENCE only. The reasons are the
 * sorted union and the basis is built from the smaller reading (mergeConfidence), so a thin month can never make either surer.
 * 05.4 FIN-08 (settled dispute 4, I62): when the two readings tie, the one that does not rest on the user's answer wins.
 */
const rests = (e: Evaluation): boolean => e.result.facts.some((f) => f.code === 'rests_on_your_answer');

/** Which of two readings' evaluations stricterOf keeps (b when it is stricter, or ties and does not rest on the user's answer). */
function pickOf(a: Evaluation, b: Evaluation): { readonly pick: Evaluation; readonly bStricter: boolean } {
  const ra = CODE_PRECEDENCE.indexOf(a.result.code);
  const rb = CODE_PRECEDENCE.indexOf(b.result.code);
  if (rb < ra) return { pick: b, bStricter: true };
  if (rb === ra && a.result.code === 'not_yet' && readyKey(b.result.readyBy) > readyKey(a.result.readyBy)) return { pick: b, bStricter: true };
  if (rb === ra && rests(a) && !rests(b)) return { pick: b, bStricter: false };
  return { pick: a, bStricter: false };
}

export function stricterOf(a: Evaluation, b: Evaluation): Evaluation {
  const { pick, bStricter } = pickOf(a, b);
  const other = pick === a ? b : a;
  // The losing reading's yes does not follow the winner: its user_said_cover reason is not merged in (the winner does not rest on it).
  const otherConf =
    rests(other) && !rests(pick) ? { ...other.result.confidence, reasons: other.result.confidence.reasons.filter((r) => r.code !== 'user_said_cover') } : other.result.confidence;
  const reasons: ReasonCode[] = [...new Set([...a.result.reasons, ...b.result.reasons, ...(bStricter ? (['thin_history_stricter'] as const) : [])])].sort();
  return { ...pick, result: { ...pick.result, reasons, confidence: mergeConfidence(pick.result.confidence, otherConf) } };
}

/**
 * The check-independent work, once. D-52: a not-ready result is not a verdict; consumers check readiness first.
 * Readiness is read from the inputs as given (never from the all-full reading) and never changes the code, the split or any figure.
 */
/** D-114: each account with no rate as an untouched account holding 0, and the envelopes in it with nothing saved. */
function withoutUnrated(raw: V3Inputs, all: readonly V3Account[], unrated: ReadonlySet<string>): V3Inputs {
  const zero = minorUnits(0);
  return {
    ...raw,
    accounts: all.map((a): V3Account => (a.noRate === true ? { id: a.id, balance: zero, use: { kind: 'untouched' } } : a)),
    envelopes: raw.envelopes.map((e) => (e.accountId != null && unrated.has(e.accountId) ? { ...e, saved: zero } : e)),
  };
}

export function prepare(raw: V3Inputs): Prepared {
  // 05.4 ENG-17 (D-114): an account no exchange rate converts counts nowhere (not spare money, extra savings, the net or the cash
  // path), and each answer names it (account_no_rate). It stays listed, so its id is known (a fund or an envelope linked to it is
  // not read as linked to no account, which would ask), but as an untouched account holding 0: a fund in it follows its live 0, an
  // envelope in it has nothing saved, it has no overdraft. The caller's balance already leaves it out (the builder cannot convert
  // it). Inputs with none stay as given.
  const all: readonly V3Account[] = raw.accounts ?? [];
  const unrated = all.filter((a) => a.noRate === true).map((a) => a.id);
  const rated = unrated.length === 0 ? raw : withoutUnrated(raw, all, new Set(unrated));
  // 05.2 D-11: one pre-pass so typical, thisMonth, incomePattern and unspent read the same months, and the fund is at its live balance
  const inputs = withLiveEmergency(withRedatedRefunds(rated));
  const ym = yearMonthOf(inputs.asOf);
  const thin = inputs.months.some((m) => m.month < ym && !m.full);
  const first = readingOf(inputs);
  const readings = thin ? [first, readingOf({ ...inputs, months: inputs.months.map((m) => (m.month < ym ? { ...m, full: true } : m)) })] : [first];
  // 05.4 FIN-25: no complete month of records before this one, read from the months as given (never the all-full reading).
  const noFullMonth = !inputs.months.some((m) => m.month < ym && m.full);
  return { inputs, readings, readiness: readinessOf(inputs, first.month), recordsSynced: recordsSynced(inputs), noFullMonth, unrated };
}

/**
 * 05.4 D-43 (QE-01, QE-13): an answer that rests on quick estimates or thin records asks about the loans, cards and overdraft that
 * are not recorded: a fact, never the code (ask, don't block). An overdraft the answer already asks about (no_overdraft_limit, D-38)
 * is not asked twice. Asks (needs_input) carry it not.
 */
function askDebts(inputs: V3Inputs, r: Result): Fact[] {
  const thin = r.confidence.basis.kind === 'quick_estimates' || r.confidence.basis.kind === 'partial';
  if (!thin || r.code === 'needs_input') return [];
  const asked = r.facts.some((f) => f.code === 'no_overdraft_limit');
  const kind = debtsNotRecorded(asked ? { debts: inputs.debts } : inputs);
  return kind === null ? [] : [{ code: 'ask_debts_not_recorded', values: { kind } }];
}

/**
 * 05.4 APP-02 (D-113) and ENG-17 (D-114): the notes on top of every answer, notes only (never an input to the sums): changes not
 * saved yet come first, then each account with no exchange rate.
 */
function leadNotes(p: Prepared): Notice[] {
  const out: Notice[] = p.inputs.unsavedWrites > 0 ? [{ code: 'unsaved_changes', values: {} }] : [];
  for (const id of p.unrated) out.push({ code: 'account_no_rate', values: { account: id } });
  return out;
}

/** Per key press: purchase -> cash -> judge on each prepared reading, the stricter kept (D-42). */
export function judgeCheck(p: Prepared, check: CheckV2): Evaluation {
  return judgeCheckWith(p, check, {});
}

/** judgeCheck with engine-internal options (05.4 BO-05: the money set aside for save-for-it, fullCost/saveForIt.ts). */
export function judgeCheckWith(p: Prepared, check: CheckV2, opts: JudgeOpts): Evaluation {
  const [first, second] = p.readings as readonly [Reading, Reading | undefined];
  const a = judgeReading(first, check, opts);
  const chosen = second === undefined ? a : stricterOf(a, judgeReading(second, check, opts));
  // 05.4 ENG-14, UX-29: the records date travels with the result when the caller gave one (absent stays absent, so a
  // result for inputs without it is unchanged); records_synced says the answer rests on recently synced records.
  const reasons: readonly ReasonCode[] = p.recordsSynced ? [...chosen.result.reasons, 'records_synced'] : chosen.result.reasons;
  const asOf = p.inputs.recordsAsOf;
  // 05.4 FIN-09 (D-24): the answer's month figure starts from Home's (the stricter reading's month, homeFigure), so the two differ by
  // exactly what the purchase takes this month; the month_left_after fact says the same figure.
  const afterBuy = rebased(chosen.result.afterBuy, homeFigure(p));
  const sameMonth = (f: Fact): Fact => (f.code === 'month_left_after' ? { ...f, values: { ...f.values, left: afterBuy.month } } : f);
  // 05.4 FIN-25 (round 1, research section 6): thin records say so as a fact next to the quick_estimates or few_months reason,
  // whatever the answer (an ask included: the fact is true either way).
  const noFull = p.noFullMonth ? [...chosen.result.facts, { code: 'no_full_month' as const, values: {} }] : chosen.result.facts;
  const facts = [...noFull, ...askDebts(p.inputs, chosen.result)].map(sameMonth);
  const notices = [...leadNotes(p), ...chosen.result.notices];
  const result: Result = { ...chosen.result, reasons, facts, notices, afterBuy, readiness: p.readiness, ...(asOf === undefined ? {} : { recordsAsOf: asOf }) };
  // 05.4 D-64 (4), D-119 (05.4-37): read from the finished answer; it never changes it (I75).
  const caveats = caveatsFor({ result, month: chosen.month, purchase: chosen.purchase }, p.inputs, check);
  // 05.4 CMP-F04 (D-123, 05.4-38): the money-help pointer goes last, read from the finished answer; it never changes it (I76).
  const help = freeHelpFacts(result, p.inputs.region);
  return { ...chosen, result: { ...result, facts: [...result.facts, ...help], caveats } };
}

/** 06.1 UX-38 (D55): what the dated list reads for one check: the open path, the opening balance and every labelled flow on it. */
export interface TimelineSource {
  readonly open: OpenCashPath;
  readonly opening: MinorUnits;
  /** The open path's flows (openFlowsOf), then the purchase side's (purchaseSideOf): the flows the cash check's path sums. */
  readonly flows: readonly LabelledFlow[];
}

/** The reading judgeCheck keeps for the check (D-42: the stricter of two), with its flows; the same functions the judgement reads. */
export function timelineOf(p: Prepared, check: CheckV2): TimelineSource {
  const [first, second] = p.readings as readonly [Reading, Reading | undefined];
  let r = first;
  if (second !== undefined) {
    const a = judgeReading(first, check, {});
    if (pickOf(a, judgeReading(second, check, {})).pick !== a) r = second;
  }
  const side = purchaseSideOf(r, check, {});
  return { open: r.open, opening: side.opening, flows: [...openFlowsOf(r), ...side.labelled] };
}
