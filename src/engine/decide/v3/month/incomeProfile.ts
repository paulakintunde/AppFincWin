/**
 * Money in, by income profile (05.1 S2; v3 section 4.2, I3, I39, D-18, D-19). Pure: the caller passes asOf.
 *
 * Income that may not arrive is not cash (I3): a pay occurrence more than MISSED_PAY_GRACE_DAYS overdue stops
 * counting, and under (a) "match what comes in" an unreceived line counts only when the user marked it expected.
 * Other income (side business, rent, own income types) counts only when marked available (D-19). The series amount
 * as of today is used, so a raise or a job loss moves income at once (D-18).
 *
 * Rule split. The pay series follow the salary rule (confirmed pay at its dates) when the profile has a salary part
 * (or no profile). Every other income follows the profile's variable method when the profile has a variable part
 * (commission, freelance, mix); a salary-only profile counts other income by its confirmed dates once marked
 * available. A commission/freelance-only profile sends the pay series through the variable method too.
 */
import { divideHalfUp } from "../../../money/rounding";
import type { MinorUnits } from "../../../money/types";
import { minorFromBigInt } from "../../../payoff/types";
import { MISSED_PAY_GRACE_DAYS, PAY_MATCH_DAYS } from "../constants";
import { addDays, addYearMonths, yearMonthOf } from "../dates";
import { resolveIncomeKind } from "../judge/options";
import type {
  CustomOptions,
  IncomeProfile,
  IncomeThisMonth,
  ReasonCode,
  RoughFigures,
  V3Line,
  V3Month,
  V3Series,
  VariableMethod,
} from "../types";
import {
  classifyLine,
  liveSeriesOf,
  paymentsPerYear,
  seriesIndex,
  seriesOccurrences,
} from "./series";
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from "./settle";

export interface IncomeInput {
  readonly asOf: string;
  readonly current: V3Month | null;
  readonly history: readonly V3Month[];
  readonly series: readonly V3Series[];
  readonly profile: IncomeProfile | null;
  readonly rough: RoughFigures | null;
  readonly custom: CustomOptions;
}

type Rule = VariableMethod | "series";

interface Plan {
  readonly paySalary: boolean;
  readonly hasVariable: boolean;
  readonly rule: Rule;
}

function planOf(profile: IncomeProfile | null): Plan {
  if (profile === null)
    return { paySalary: true, hasVariable: false, rule: "series" };
  const types = profile.types;
  const hasVariable = types.some(
    (t) => t === "commission" || t === "freelance" || t === "mix",
  );
  const paySalary =
    !hasVariable || types.includes("salary") || types.includes("mix");
  return {
    paySalary,
    hasVariable,
    rule: hasVariable ? (profile.variable ?? "match") : "series",
  };
}

function big(n: number): bigint {
  return BigInt(n);
}

function monthBounds(asOf: string): {
  readonly ym: string;
  readonly start: string;
  readonly next: string;
} {
  const ym = yearMonthOf(asOf);
  return { ym, start: `${ym}-01`, next: `${addYearMonths(ym, 1)}-01` };
}

interface Eligibility {
  readonly ok: boolean;
  readonly salary: boolean;
  readonly reasons: readonly ReasonCode[];
}

const NOT_INCOME: Eligibility = { ok: false, salary: false, reasons: [] };

function eligibility(
  line: V3Line,
  idx: ReadonlyMap<string, V3Series>,
  plan: Plan,
  custom: CustomOptions,
): Eligibility {
  if (line.role !== "income") return NOT_INCOME;
  const cls = classifyLine(line, idx);
  const s = line.seriesId === null ? undefined : idx.get(line.seriesId);
  if (cls === "recurring_income" && s !== undefined && s.role === "pay")
    return { ok: true, salary: plan.paySalary, reasons: [] };
  const kind = line.incomeKind ?? (s === undefined ? null : s.incomeKind);
  const ca = line.countsAs ?? (s === undefined ? null : s.countsAs);
  if (kind === null && ca === null && plan.hasVariable)
    return { ok: true, salary: false, reasons: [] }; // the profile's own variable income
  const r = resolveIncomeKind(kind, ca, custom);
  if (r.countsAs === "available")
    return { ok: true, salary: false, reasons: [] };
  const reasons: ReasonCode[] = [...r.reasons];
  if (r.countsAs === null && !reasons.includes("income_kind_unmarked"))
    reasons.push("income_kind_unmarked");
  return { ok: false, salary: false, reasons };
}

/** Does an other-income series count (marked available)? Pay series always do. */
function seriesCounts(s: V3Series, custom: CustomOptions): boolean {
  if (s.role === "pay") return true;
  return (
    resolveIncomeKind(s.incomeKind, s.countsAs, custom).countsAs === "available"
  );
}

/** The part of a spread line that falls in `ym`, or null when the cover window does not reach it. Remainder to the last month. */
function spreadPart(line: V3Line, ym: string): bigint | null {
  const n = line.coversMonths;
  if (n === null || n <= 1) return null;
  const start = yearMonthOf(line.date);
  for (let i = 0; i < n; i++) {
    if (addYearMonths(start, i) !== ym) continue;
    const part = divideHalfUp(big(line.amount), big(n));
    return i === n - 1 ? big(line.amount) - part * big(n - 1) : part;
  }
  return null;
}

function sumMonthly(s: V3Series): bigint {
  const { num, den } = paymentsPerYear(s.cadence);
  return divideHalfUp(big(s.amount) * big(num), big(12 * den));
}

export function incomeThisMonth(input: IncomeInput): IncomeThisMonth {
  const { asOf, current, history, series, profile, rough, custom } = input;
  const plan = planOf(profile);
  const idx = seriesIndex(series);
  const { ym, start, next } = monthBounds(asOf);
  const cutoff = addDays(asOf, -MISSED_PAY_GRACE_DAYS);
  const reasons = new Set<ReasonCode>();

  const curLines = current === null ? [] : current.lines;
  let salaryReceived = 0n;
  let varReceived = 0n;
  let varDue = 0n;
  let salaryDue = 0n;

  // Which due dates did a paid line settle? One matcher for every caller (M-02); D-51/D-56: a line linked to the series,
  // or a typed/statement income line with no link and the right amount. The window is symmetric and nearest-first (H-02).
  // Income belongs to its due month (W4): the due set also holds the neighbouring months' occurrences within the window,
  // so a line near a month boundary is claimed by the occurrence it is closest to, and last month's lines count here
  // only when they settle one of this month's occurrences.
  const datedSeries: V3Series[] = [];
  for (const s of series) {
    const salary = s.role === "pay" && plan.paySalary;
    if (!(salary || (s.role === "other_income" && plan.rule === "series")))
      continue;
    if (!seriesCounts(s, custom)) {
      const r = resolveIncomeKind(s.incomeKind, s.countsAs, custom); // only other income can fail: pay always counts
      for (const x of r.reasons) reasons.add(x);
      if (r.countsAs === null) reasons.add("income_kind_unmarked");
      continue;
    }
    datedSeries.push(s);
  }
  const datedIds = new Set(datedSeries.map((s) => s.id));
  const prevMonth = addYearMonths(ym, -1);
  const prevFrom = addDays(start, -PAY_MATCH_DAYS);
  const nextTo = addDays(next, PAY_MATCH_DAYS);
  const due: Due[] = [];
  for (const s of datedSeries) {
    for (const date of seriesOccurrences(s, prevFrom, nextTo, asOf)) {
      due.push({ seriesId: s.id, date, amount: s.amount });
    }
  }
  const paid: PaidLine[] = [];
  const fromLastMonth = new Set<string>();
  for (const l of curLines) {
    if (l.status !== "paid") continue;
    if (l.seriesId !== null ? datedIds.has(l.seriesId) : l.role === "income")
      paid.push(toPaidLine(l));
  }
  for (const m of history) {
    if (m.month !== prevMonth) continue;
    for (const l of m.lines) {
      if (
        l.status === "paid" &&
        l.seriesId !== null &&
        datedIds.has(l.seriesId) &&
        l.date >= prevFrom &&
        !fromLastMonth.has(l.id)
      ) {
        fromLastMonth.add(l.id);
        paid.push(toPaidLine(l));
      }
    }
  }
  const cadenceOf = new Map(datedSeries.map((s) => [s.id, s.cadence]));
  const { settled, usedLines, lineFor } = settle(due, paid, (id) =>
    matchWindowDays(cadenceOf.get(id) as V3Series["cadence"], PAY_MATCH_DAYS),
  );
  const isSalary = (seriesId: string): boolean =>
    (idx.get(seriesId) as V3Series).role === "pay" && plan.paySalary;
  // Lines of this month that the due loop accounts for itself: typed/statement lines (no series link) that settled a
  // due date, and linked lines that settled an occurrence of another month.
  const accounted = new Set<string>();
  for (const d of due) {
    const id = lineFor.get(`${d.seriesId}|${d.date}`);
    if (id === undefined) continue;
    const thisMonthDue = d.date >= start && d.date < next;
    if (!thisMonthDue) accounted.add(id);
  }
  const curById = new Map(curLines.map((l) => [l.id, l]));
  const paidById = new Map(paid.map((l) => [l.id, l]));
  for (const id of usedLines) {
    const l = curById.get(id);
    if (l !== undefined && l.seriesId === null) accounted.add(id);
  }

  // Received this month.
  for (const l of curLines) {
    if (l.status !== "paid") continue;
    const e = eligibility(l, idx, plan, custom);
    for (const r of e.reasons) reasons.add(r);
    if (!e.ok || accounted.has(l.id)) continue;
    if (e.salary) salaryReceived += big(l.amount);
    else if (
      plan.rule === "spread" &&
      l.coversMonths !== null &&
      l.coversMonths > 1
    )
      continue; // handled below
    else varReceived += big(l.amount);
  }

  // Spread lines from the months they cover (current month included).
  if (plan.rule === "spread") {
    const seen = new Set<string>();
    const months: V3Month[] = [];
    if (current !== null) months.push(current);
    for (const m of history) months.push(m);
    for (const m of months) {
      if (seen.has(m.month)) continue;
      seen.add(m.month);
      for (const l of m.lines) {
        if (l.status !== "paid") continue;
        const part = spreadPart(l, ym);
        if (part === null) continue;
        const e = eligibility(l, idx, plan, custom);
        if (!e.ok || e.salary) continue;
        varReceived += part;
      }
    }
  }

  // Confirmed series due this month (the salary rule, and other income by dates under a salary profile).
  for (const d of due) {
    if (d.date < start || d.date >= next) continue;
    const key = `${d.seriesId}|${d.date}`;
    const salary = isSalary(d.seriesId);
    if (settled.has(key)) {
      const id = lineFor.get(key) as string;
      const line = paidById.get(id) as PaidLine;
      // Counted as received here: a typed/statement line (D-56) or a line from last month that settles this month's
      // date (W4). A linked line of this month is already counted in "Received this month".
      if (line.seriesId === null || fromLastMonth.has(id)) {
        const amount = big(line.amount);
        if (salary) salaryReceived += amount;
        else varReceived += amount;
      }
      continue;
    }
    if (d.date < cutoff) {
      reasons.add("missed_pay_excluded");
      continue;
    }
    if (salary) salaryDue += big(d.amount);
    else varDue += big(d.amount);
  }

  // (a) match: pending lines the user marked expected, due by month end.
  if (plan.rule === "match") {
    for (const l of curLines) {
      if (l.status !== "pending" || !l.expected) continue;
      if (l.date < start || l.date >= next) continue;
      const e = eligibility(l, idx, plan, custom);
      for (const r of e.reasons) reasons.add(r);
      if (!e.ok || e.salary) continue;
      if (l.date < cutoff) {
        reasons.add("missed_pay_excluded");
        continue;
      }
      varDue += big(l.amount);
    }
  }

  const received = salaryReceived + varReceived;
  const dueConfirmed = salaryDue + varDue;
  let varTotal = varReceived + varDue;
  if (plan.rule === "steady" && profile !== null && profile.steady !== null)
    varTotal = big(profile.steady);
  if (plan.rule === "balance") varTotal = varReceived;
  let total = salaryReceived + salaryDue + varTotal;

  const hasPay = liveSeriesOf(series, asOf, "pay").length > 0;
  if (
    total === 0n &&
    received === 0n &&
    dueConfirmed === 0n &&
    !hasPay &&
    rough !== null
  ) {
    total = big(rough.income);
    reasons.add("rough_figures_used");
  }

  return {
    received: minorFromBigInt(received, "incomeThisMonth"),
    dueConfirmed: minorFromBigInt(dueConfirmed, "incomeThisMonth"),
    total: minorFromBigInt(total, "incomeThisMonth"),
    reasons: [...reasons],
  };
}

export function typicalIncome(input: IncomeInput): {
  readonly amount: MinorUnits;
  readonly hasConfirmedIncome: boolean;
  readonly reasons: readonly ReasonCode[];
} {
  const { asOf, series, profile, rough, custom } = input;
  const plan = planOf(profile);
  const reasons = new Set<ReasonCode>();
  const pay = liveSeriesOf(series, asOf, "pay");
  const hasConfirmedIncome = pay.length > 0;

  let sum = 0n;
  let any = false;
  const steady =
    plan.rule === "steady" && profile !== null && profile.steady !== null
      ? big(profile.steady)
      : null;
  if (steady !== null) {
    if (plan.paySalary)
      for (const s of pay) {
        sum += sumMonthly(s);
        any = true;
      }
    sum += steady;
    any = true;
  } else {
    for (const s of pay) {
      sum += sumMonthly(s);
      any = true;
    }
    for (const s of liveSeriesOf(series, asOf, "other_income")) {
      const r = resolveIncomeKind(s.incomeKind, s.countsAs, custom);
      if (r.countsAs === "available") {
        sum += sumMonthly(s);
        any = true;
      } else {
        for (const x of r.reasons) reasons.add(x);
        if (r.countsAs === null) reasons.add("income_kind_unmarked");
      }
    }
  }
  if (!any && rough !== null) {
    reasons.add("rough_figures_used");
    return { amount: rough.income, hasConfirmedIncome, reasons: [...reasons] };
  }
  return {
    amount: minorFromBigInt(sum, "typicalIncome"),
    hasConfirmedIncome,
    reasons: [...reasons],
  };
}
