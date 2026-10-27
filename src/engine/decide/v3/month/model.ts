/**
 * Recurring first (v3 §4.1-§4.4, SC-1/SC-2). Composes series → income → typical → this month → confidence.
 * Never calls detectCandidates (I34): only confirmed series reach the month. Pure: the caller passes asOf.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { totalSetAside } from '../../pots';
import { V3_VARIABLE_HISTORY_MONTHS } from '../constants';
import { yearMonthOf } from '../dates';
import { monthlyEquivalentOf } from '../plan/cadence';
import type { IncomePicture, MonthModel, Notice, NoticeCode, ReasonCode, V3Inputs } from '../types';
import { confidenceOf } from './confidence';
import { incomeThisMonth, typicalIncome, type IncomeInput } from './incomeProfile';
import {
  buildIncomeMonths,
  expectedFor,
  incomeSwings,
  isVolatile,
  leanLeftOf,
  newestIncomes,
  recordedIncomeByMonth,
  resolvePattern,
  sameCalendarMonth,
  seasonEveryday,
  windowMonthsOf,
} from './incomePattern';
import { liveSeriesOf } from './series';
import { thisMonth } from './thisMonth';
import { typicalOf } from './typical';

/** Debt minimums + fixed saving/investing + envelope set-asides. Flexible saving is explorer-only (excluded). */
export function setAsideOf(inputs: V3Inputs): MinorUnits {
  let total = 0n;
  for (const d of inputs.debts) total += BigInt(d.minimum);
  for (const role of ['saving', 'investing'] as const) {
    for (const s of liveSeriesOf(inputs.series, inputs.asOf, role)) {
      if (s.savingMode === 'flexible') continue;
      total += BigInt(monthlyEquivalentOf(s.amount, s.cadence));
    }
  }
  total += BigInt(totalSetAside(inputs.envelopes, inputs.asOf).total);
  return minorFromBigInt(total, 'setAsideOf');
}

// Fixed order so two equal models always compare equal.
const NOTICE_ORDER: readonly NoticeCode[] = [
  'typical_short',
  'month_heading_short',
  'yearly_bill_choice_needed',
  'month_looks_under_logged',
  'income_kind_unmarked',
  'from_your_figures',
  'history_window_12',
  'income_from_expected',
  'same_season_compared',
  'unsaved_changes',
];

export function buildMonthModel(inputs: V3Inputs): MonthModel {
  const currentYm = yearMonthOf(inputs.asOf);
  const current = inputs.months.find((m) => m.month === currentYm) ?? null;
  const history = inputs.months.filter((m) => m.month !== currentYm);
  const incomeInput: IncomeInput = {
    asOf: inputs.asOf,
    current,
    history,
    series: inputs.series,
    profile: inputs.profile,
    rough: inputs.rough,
    custom: inputs.custom,
    payArrivals: inputs.payArrivals ?? [],
  };
  const income = incomeThisMonth(incomeInput);
  const ti = typicalIncome(incomeInput);
  const setAside = setAsideOf(inputs);

  // D-33 to D-36: the income pattern decides the window and whether the typical month comes from recorded income.
  const incomeByMonth = recordedIncomeByMonth({
    asOf: inputs.asOf,
    history,
    series: inputs.series,
    profile: inputs.profile,
    custom: inputs.custom,
  });
  const swings = incomeSwings(newestIncomes(incomeByMonth, V3_VARIABLE_HISTORY_MONTHS)); // D-34
  const pattern = resolvePattern(inputs.profile, swings);
  const windowMonths = windowMonthsOf(pattern.treated);
  const typical = typicalOf({
    asOf: inputs.asOf,
    history,
    series: inputs.series,
    typicalIncome: ti.amount,
    setAside,
    everydayOverride: inputs.everydayOverride,
    rough: inputs.rough,
    windowMonths,
    incomeByMonth: pattern.treated === 'steady' ? null : incomeByMonth,
  });
  const months =
    pattern.treated === 'steady'
      ? []
      : buildIncomeMonths(typical.used, incomeByMonth, BigInt(typical.recurringBills), BigInt(setAside));
  const base = {
    stated: pattern.stated,
    treated: pattern.treated,
    swings,
    volatile: isVolatile(pattern.treated, months),
    confirmNeeded: pattern.confirmNeeded,
    windowMonths,
    fullMonths: incomeByMonth.size,
    months,
    leanLeft: pattern.treated === 'seasonal' ? leanLeftOf(months) : null,
  };
  const expected = expectedFor({ ...base }, inputs.expectedIncome ?? [], currentYm);
  const incomePicture: IncomePicture = { ...base, expectedThisMonth: expected === null ? null : expected.amount };

  // D-35: this month's money in is the larger of what has arrived and the expected figure (variable or seasonal only).
  const raised = expected !== null && BigInt(expected.amount) > BigInt(income.received);
  const incomeUsed = expected === null ? income : { ...income, total: raised ? expected.amount : income.received };
  const seasonE = seasonEveryday(incomePicture, currentYm); // D-39
  const seasonMonth = seasonE === null ? null : sameCalendarMonth(months, currentYm);

  const tm = thisMonth({
    asOf: inputs.asOf,
    current,
    series: inputs.series,
    income: incomeUsed,
    e: seasonE ?? typical.e,
    roughExpenses: inputs.rough?.expenses ?? null,
    setAside,
  });

  const reasonSet = new Set<ReasonCode>([...income.reasons, ...ti.reasons, ...typical.reasons]);
  if (windowMonths === V3_VARIABLE_HISTORY_MONTHS) reasonSet.add('long_history_window'); // D-33
  if (seasonE !== null) reasonSet.add('same_season_spending'); // D-39
  if (raised && expected.source === 'confirmed') reasonSet.add('expected_income_used'); // D-35
  const confidence = confidenceOf({
    monthsUsed: typical.monthsUsed.length,
    day: tm.day,
    everydayLogged: tm.everydayLogged,
    e: typical.e,
    unsavedWrites: inputs.unsavedWrites,
    roughUsed: reasonSet.has('rough_figures_used'),
    provisionalRates: inputs.provisionalRates,
  });

  const raw: Notice[] = [...typical.notices];
  if (typical.typicalLeft !== null && typical.typicalLeft < 0) {
    raw.push({ code: 'typical_short', values: { short: -typical.typicalLeft } });
  }
  if (tm.monthLeft < 0) {
    raw.push({
      code: 'month_heading_short',
      values:
        // The category variant needs a name to say, so an uncategorised largest line is left out too.
        tm.largestLine === null || tm.largestLine.categoryId === null
          ? { month: tm.month, short: -tm.monthLeft }
          : { month: tm.month, short: -tm.monthLeft, categoryId: tm.largestLine.categoryId, largest: tm.largestLine.amount },
    });
  }
  // D-46: say which basis set this month's figures.
  if (windowMonths === V3_VARIABLE_HISTORY_MONTHS) raw.push({ code: 'history_window_12', values: { months: windowMonths } });
  if (raised) {
    const source = expected.source === 'confirmed' ? 'confirmed' : pattern.treated === 'seasonal' ? 'last_year' : 'low';
    const sameMonth = source === 'last_year' ? (sameCalendarMonth(months, currentYm) as { month: string }).month : null;
    raw.push({
      code: 'income_from_expected',
      values: { month: currentYm, amount: expected.amount, source, ...(sameMonth === null ? {} : { sameMonth }) },
    });
  }
  if (seasonMonth !== null) {
    raw.push({ code: 'same_season_compared', values: { lastYear: seasonMonth.month, everyday: seasonMonth.everyday } });
  }
  if (reasonSet.has('income_kind_unmarked')) raw.push({ code: 'income_kind_unmarked', values: {} });
  if (inputs.unsavedWrites > 0) raw.push({ code: 'unsaved_changes', values: { count: inputs.unsavedWrites } });
  const notices = NOTICE_ORDER.flatMap((code) => raw.filter((n) => n.code === code));

  return {
    month: tm.month,
    day: tm.day,
    daysInMonth: tm.daysInMonth,
    moneyIn: tm.moneyIn,
    moneyOut: tm.moneyOut,
    billsPaid: tm.billsPaid,
    billsDue: tm.billsDue,
    everydayLogged: tm.everydayLogged,
    erest: tm.erest,
    setAside: tm.setAside,
    monthLeft: tm.monthLeft,
    e: typical.e,
    typicalIncome: typical.typicalIncome,
    recurringBills: typical.recurringBills,
    typicalLeft: typical.typicalLeft,
    low: typical.low,
    monthsUsed: typical.monthsUsed,
    categoryMonthly: typical.categoryMonthly,
    housingMonthly: typical.housingMonthly,
    largestLine: tm.largestLine,
    confidence,
    notices,
    reasons: [...reasonSet].sort(),
    incomePicture,
    ...(income.unseenPay === undefined ? {} : { unseenPay: income.unseenPay }), // D-58
  };
}
