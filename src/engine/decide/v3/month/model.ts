/**
 * Recurring first (v3 §4.1-§4.4, SC-1/SC-2). Composes series → income → typical → this month → confidence.
 * Never calls detectCandidates (I34): only confirmed series reach the month. Pure: the caller passes asOf.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { totalSetAside } from '../../pots';
import { yearMonthOf } from '../dates';
import { monthlyEquivalentOf } from '../plan/cadence';
import type { MonthModel, Notice, NoticeCode, ReasonCode, V3Inputs } from '../types';
import { confidenceOf } from './confidence';
import { incomeThisMonth, typicalIncome, type IncomeInput } from './incomeProfile';
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
  };
  const income = incomeThisMonth(incomeInput);
  const ti = typicalIncome(incomeInput);
  const setAside = setAsideOf(inputs);
  const typical = typicalOf({
    asOf: inputs.asOf,
    history,
    series: inputs.series,
    typicalIncome: ti.amount,
    setAside,
    everydayOverride: inputs.everydayOverride,
    rough: inputs.rough,
  });
  const tm = thisMonth({
    asOf: inputs.asOf,
    current,
    series: inputs.series,
    income,
    e: typical.e,
    roughExpenses: inputs.rough?.expenses ?? null,
    setAside,
  });

  const reasonSet = new Set<ReasonCode>([...income.reasons, ...ti.reasons, ...typical.reasons]);
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
    typicalIncome: ti.amount,
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
  };
}
