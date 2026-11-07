// 06-14 (GRW-07..09, D-13, D-15, D-28): the Debts segment's read model. PURE composition of the engine's payoff maths
// (fixedPayoff, strategy, estimatedCardMinimum) and the connection point debtPointOf; nothing here is stored in the cache and
// no figure is worked out in this file.
//
// D-28: a carried card with no typed minimum uses estimatedCardMinimum and is flagged `minimumEstimated` so the screen labels
// it an estimate. That estimate is for Grow's plan and labels only: Decide keeps reading the stored minimum_payment.
import { useCallback, useMemo } from 'react';
import { useDebts } from '@/data/queries/decide';
import type { DebtRow } from '@/db/debts';
import { minorUnits, type MinorUnits } from '@/engine/money';
import {
  estimatedCardMinimum,
  fixedPayoff,
  percent,
  strategy,
  ZERO_PERCENT,
  type PayoffOutcome,
  type PayoffOrder,
  type PlanDebt,
  type StrategyResult,
} from '@/engine/payoff';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { debtPointOf, type DebtPoint } from '../connect';
import { dueDateOf } from '../connect/debtPoint';

export type DebtsStatus = 'loading' | 'error' | 'ready';

/** The what-if figures the segment starts with: an extra a month and a one-off lump, in minor units. */
export const DEFAULT_EXTRA = 5000;
export const DEFAULT_LUMP = 100000;

export interface DebtLine {
  id: string;
  name: string;
  kind: DebtRow['kind'];
  currency: string;
  /** Balance, rate, minimum (typed or estimated), due day, payoff date and interest, from the connection point. */
  point: DebtPoint;
  /** D-28: the minimum in `point` is the estimate, not a typed figure. */
  minimumEstimated: boolean;
  startedBalance: number | null;
  /** The extra a month saved on this debt. */
  extra: number;
  order: PayoffOrder | null;
  /** In the combined payoff plan (open, carried, same currency as the plan). */
  inPlan: boolean;
}

export interface PlanOutcome {
  outcome: PayoffOutcome;
  months: number;
  totalInterest: MinorUnits | null;
  /** The date the last debt clears, from the due day of that debt (today's day when it has none); null when it never clears. */
  payoffDate: string | null;
}

/** One what-if worked end to end: outcome, months, interest and the date the last payment lands (null unless it clears). */
export interface WhatIf {
  outcome: PayoffOutcome;
  months: number;
  totalInterest: MinorUnits | null;
  payoffDate: string | null;
}

/** Exact differences against minimum only; null when either side does not clear; never negative. Screens round and format. */
export interface Compare {
  soonerMonths: number | null;
  lessInterest: MinorUnits | null;
}

export interface PlanScenarios {
  minimumOnly: WhatIf;
  withExtra: WhatIf & Compare;
  withLump: WhatIf & Compare;
  /** The first open debt in this order: where a recorded one-off goes. */
  lumpFirstDebtId: string | null;
}

export interface OrderPlan {
  withoutExtra: PlanOutcome;
  withExtra: PlanOutcome;
}

export interface Scenario {
  outcome: PayoffOutcome;
  months: number;
  totalInterest: MinorUnits | null;
}

export interface DebtsModel {
  /** Open debts, carried or not, in the order stored. Paid-off debts are left out. */
  debts: DebtLine[];
  /** D-15: cards paid in full each month; listed apart and left out of the plan. */
  paidInFull: DebtLine[];
  /** The currency the combined plan is worked in (the largest open balance). Debts in other currencies are not in it. */
  planCurrency: string | null;
  /** The extra a month the plan includes (sum over the plan's debts). */
  extra: number;
  /** The saved order, or null when none was chosen. */
  savedOrder: PayoffOrder | null;
  /** One debt in the plan: both orders are the same (D-13). */
  oneDebt: boolean;
  plan: { rate: OrderPlan; balance: OrderPlan } | null;
  /** What-ifs for the focus debt (the largest in the plan): minimum only, with the extra, with the lump. */
  focus: { id: string; minimumOnly: Scenario; withExtra: Scenario; withLump: Scenario } | null;
  /** D-30: plan-wide what-ifs (minimum only, extra each month, once) for each order. */
  scenarios: { rate: PlanScenarios; balance: PlanScenarios } | null;
  /** The plan at the SAVED extra, for the hero second line; null when the saved extra is 0. */
  savedExtraPlan: { rate: WhatIf; balance: WhatIf } | null;
}

export interface DebtsRead {
  status: DebtsStatus;
  model: DebtsModel;
  refetch: () => void;
  userId: string | null;
  householdId: string | null;
  today: string;
}

export const EMPTY_DEBTS_MODEL: DebtsModel = {
  debts: [],
  paidInFull: [],
  planCurrency: null,
  extra: 0,
  savedOrder: null,
  oneDebt: false,
  plan: null,
  focus: null,
  scenarios: null,
  savedExtraPlan: null,
};

const scenarioOf = (r: ReturnType<typeof fixedPayoff>): Scenario => ({ outcome: r.outcome, months: r.months, totalInterest: r.totalInterest });

const dayOfMonth = (today: string): number => Number(today.slice(8, 10));

/** The date of the last payment: the due day when there is one, else today's day of the month (audit section 3). */
function lastPaymentDate(today: string, dueDay: number | null, months: number): string {
  return months <= 0 ? today : dueDateOf(today, dueDay ?? dayOfMonth(today), months - 1);
}

function whatIfOf(r: StrategyResult, dueDayOf: (id: string) => number | null, today: string): WhatIf {
  let last: { id: string; month: number } | null = null;
  for (const d of r.debts) {
    if (d.doneMonth !== null && d.doneMonth > 0 && (last === null || d.doneMonth > last.month)) last = { id: d.id, month: d.doneMonth };
  }
  return {
    outcome: r.outcome,
    months: r.months,
    totalInterest: r.totalInterest,
    payoffDate: r.outcome === 'cleared' ? lastPaymentDate(today, last === null ? null : dueDayOf(last.id), last === null ? 0 : last.month) : null,
  };
}

const planOutcome = whatIfOf;

function compareOf(base: WhatIf, sc: WhatIf): Compare {
  if (base.outcome !== 'cleared' || sc.outcome !== 'cleared' || base.totalInterest === null || sc.totalInterest === null) {
    return { soonerMonths: null, lessInterest: null };
  }
  return {
    soonerMonths: Math.max(0, base.months - sc.months),
    lessInterest: minorUnits(Math.max(0, base.totalInterest - sc.totalInterest)),
  };
}

/** Pure: one debt's what-if via fixedPayoff (debt detail chips): minimum only against the extra a month and/or a one-off. */
export function debtWhatIf(line: DebtLine, today: string, opts: { extra?: number; lump?: number }): { minimumOnly: WhatIf; scenario: WhatIf & Compare } {
  const apr = line.point.apr ?? ZERO_PERCENT;
  const dueDay = line.point.dueDay;
  const toWhatIf = (r: ReturnType<typeof fixedPayoff>): WhatIf => ({
    outcome: r.outcome,
    months: r.months,
    totalInterest: r.totalInterest,
    payoffDate: r.outcome === 'cleared' ? lastPaymentDate(today, dueDay, r.months) : null,
  });
  const minimumOnly = toWhatIf(fixedPayoff(line.point.balance, apr, line.point.minimum));
  const scenario = toWhatIf(
    fixedPayoff(line.point.balance, apr, line.point.minimum, { extra: minorUnits(opts.extra ?? 0), lump: minorUnits(opts.lump ?? 0) })
  );
  return { minimumOnly, scenario: { ...scenario, ...compareOf(minimumOnly, scenario) } };
}

/** Pure: the model from the debts. `opts` sets the what-if sizes. */
export function buildDebtsModel(rows: readonly DebtRow[], today: string, opts: { extra?: number; lump?: number } = {}): DebtsModel {
  const extraWhatIf = opts.extra ?? DEFAULT_EXTRA;
  const lump = opts.lump ?? DEFAULT_LUMP;
  const lines: DebtLine[] = [];
  const paidInFull: DebtLine[] = [];
  for (const row of rows) {
    if (row.deleted_at !== null) continue;
    const apr = row.apr ? percent(row.apr) : ZERO_PERCENT;
    const paysFull = row.kind === 'card' && row.pays_in_full === 'yes';
    const estimated = !paysFull && row.kind === 'card' && row.minimum_payment === 0 && row.balance > 0;
    const effective: DebtRow = estimated ? { ...row, minimum_payment: estimatedCardMinimum(minorUnits(row.balance), apr) } : row;
    const point = debtPointOf(effective, today);
    if (point.paidOff) continue;
    const line: DebtLine = {
      id: row.id,
      name: row.name,
      kind: row.kind,
      currency: row.currency,
      point,
      minimumEstimated: estimated,
      startedBalance: row.started_balance ?? null,
      extra: row.payoff_extra ?? 0,
      order: row.payoff_order ?? null,
      inPlan: false,
    };
    (paysFull ? paidInFull : lines).push(line);
  }

  // The combined plan: carried debts with something owed, worked in one currency (the one with the most owed).
  const carried = lines.filter((l) => l.point.balance > 0);
  const totals = new Map<string, number>();
  for (const l of carried) totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.point.balance);
  let planCurrency: string | null = null;
  for (const [cur, total] of totals) {
    if (planCurrency === null || total > (totals.get(planCurrency) ?? 0)) planCurrency = cur;
  }
  const inPlan = carried.filter((l) => l.currency === planCurrency);
  for (const l of inPlan) l.inPlan = true;

  const extra = inPlan.reduce((s, l) => s + l.extra, 0);
  const savedOrder = inPlan.find((l) => l.order !== null)?.order ?? null;
  const planDebts: PlanDebt[] = inPlan.map((l) => ({ id: l.id, balance: l.point.balance, apr: l.point.apr ?? ZERO_PERCENT, minimum: l.point.minimum }));
  const dueDayOf = (id: string): number | null => inPlan.find((l) => l.id === id)?.point.dueDay ?? null;

  let plan: DebtsModel['plan'] = null;
  if (planDebts.length > 0) {
    const orderPlan = (order: PayoffOrder): OrderPlan => ({
      withoutExtra: planOutcome(strategy(planDebts, minorUnits(0), order), dueDayOf, today),
      withExtra: planOutcome(strategy(planDebts, minorUnits(extra), order), dueDayOf, today),
    });
    plan = { rate: orderPlan('rate'), balance: orderPlan('balance') };
  }

  let focus: DebtsModel['focus'] = null;
  const biggest = inPlan.reduce<DebtLine | null>((best, l) => (best === null || l.point.balance > best.point.balance ? l : best), null);
  if (biggest !== null) {
    const apr = biggest.point.apr ?? ZERO_PERCENT;
    const base = (opts2: { extra?: MinorUnits; lump?: MinorUnits }) => fixedPayoff(biggest.point.balance, apr, biggest.point.minimum, opts2);
    focus = {
      id: biggest.id,
      minimumOnly: scenarioOf(base({})),
      withExtra: scenarioOf(base({ extra: minorUnits(extraWhatIf) })),
      withLump: scenarioOf(base({ lump: minorUnits(lump) })),
    };
  }

  let scenarios: DebtsModel['scenarios'] = null;
  let savedExtraPlan: DebtsModel['savedExtraPlan'] = null;
  if (planDebts.length > 0) {
    const scenariosFor = (order: PayoffOrder): PlanScenarios => {
      const minimumOnly = whatIfOf(strategy(planDebts, minorUnits(0), order), dueDayOf, today);
      const withExtra = whatIfOf(strategy(planDebts, minorUnits(extraWhatIf), order), dueDayOf, today);
      const withLump = whatIfOf(strategy(planDebts, minorUnits(0), order, { lump: minorUnits(lump) }), dueDayOf, today);
      const first = planDebts
        .filter((d) => d.balance > 0)
        .sort((a, b) => (order === 'rate' ? (b.apr > a.apr ? 1 : b.apr < a.apr ? -1 : 0) : a.balance - b.balance))[0];
      return {
        minimumOnly,
        withExtra: { ...withExtra, ...compareOf(minimumOnly, withExtra) },
        withLump: { ...withLump, ...compareOf(minimumOnly, withLump) },
        lumpFirstDebtId: first?.id ?? null,
      };
    };
    scenarios = { rate: scenariosFor('rate'), balance: scenariosFor('balance') };
    if (extra > 0) {
      savedExtraPlan = {
        rate: whatIfOf(strategy(planDebts, minorUnits(extra), 'rate'), dueDayOf, today),
        balance: whatIfOf(strategy(planDebts, minorUnits(extra), 'balance'), dueDayOf, today),
      };
    }
  }

  return { debts: lines, paidInFull, planCurrency, extra, savedOrder, oneDebt: inPlan.length === 1, plan, focus, scenarios, savedExtraPlan };
}

export function useDebtsRead(): DebtsRead {
  const { userId, householdId, today } = usePastContext();
  const query = useDebts(householdId ?? undefined);
  const rows = query.data;
  const model = useMemo(() => (rows === undefined ? EMPTY_DEBTS_MODEL : buildDebtsModel(rows, today)), [rows, today]);
  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);
  const status: DebtsStatus = query.isError ? 'error' : rows !== undefined ? 'ready' : 'loading';
  return { status, model, refetch, userId, householdId, today };
}
