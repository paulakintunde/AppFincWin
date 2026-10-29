// 05-127 (D-101, R18.2): the Pots screen's pure model. Per-row display state and line 3 come from potSetAside (the
// engine's single source of truth for a pot's monthly set-aside); nothing here does money maths beyond a plain sum of
// integers and a whole percent. No React, no I/O.
import { MAX_POTS, potSetAside, type PotLine, type PotState } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wholePercent } from '../ui/GoalProgress';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';

/** What a row needs converted to the home currency; null means no usable stored rate. */
export interface PotAmounts {
  saved: number | null;
  target: number | null;
}

export type PotDisplayState = PotState | 'no_rate' | 'done';

export interface PotRowModel {
  row: SavingsGoalRow;
  /** 'wait' rows belong to their check: no edit, no delete here. */
  kind: 'pot' | 'wait';
  state: PotDisplayState;
  saved: number | null;
  target: number | null;
  pct: number;
  /** Monthly set-aside (0 for reached, past due, done and rate-less rows). */
  monthly: number;
  /** target - saved while past due (never negative). */
  remaining: number;
  /** 'YYYY-MM' of ready_by, or null. */
  month: string | null;
  doneAt: string | null;
}

export interface PotsSummary {
  total: number;
  count: number;
}

export interface PotsScreenModel {
  live: PotRowModel[];
  done: PotRowModel[];
  summary: PotsSummary;
  /** The 50-pot cap counts the pots the user creates (plain pots). */
  plainCount: number;
  addDisabled: boolean;
}

/** Whole months window for a pot date: this month or later, within 50 years. */
export const POT_MAX_YEARS = 50;

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM' to the last day of that month as 'YYYY-MM-DD' (string maths only, no time zone). */
export function lastDayOfMonth(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map((p) => parseInt(p, 10));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(day)}`;
}

/** The latest month a pot may name: 50 years after today's month. */
export function maxPotMonth(today: string): string {
  const y = parseInt(today.slice(0, 4), 10) + POT_MAX_YEARS;
  return `${String(y).padStart(4, '0')}-${today.slice(5, 7)}`;
}

export type MonthCheck = 'ok' | 'past' | 'far';

/** The chosen month against the window. `allowed` is an existing pot's own month, which stays valid when unchanged. */
export function checkPotMonth(month: string, today: string, allowed?: string): MonthCheck {
  if (month === allowed) return 'ok';
  if (month < today.slice(0, 7)) return 'past';
  if (month > maxPotMonth(today)) return 'far';
  return 'ok';
}

export type PotValidation = 'ok' | 'target_required' | 'target_out_of_range' | 'ready_by_required' | 'monthly_out_of_range';

export interface PotValidationInput {
  bucket?: string | null;
  target?: number | null;
  ready_by?: string | null;
  monthly_amount?: number | null;
}

const isMinor = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

/**
 * D-22: a saving bucket needs no target and no date; a target, when given, must be above 0, and the monthly amount
 * may be 0 up to the input cap. An ordinary pot keeps requiring a target above 0 and a ready-by date. Codes only.
 */
export function validatePot(p: PotValidationInput): PotValidation {
  const isBucket = p.bucket !== undefined && p.bucket !== null;
  if (p.target !== undefined && p.target !== null && (!isMinor(p.target) || p.target < 1)) return 'target_out_of_range';
  if (isBucket) {
    if (p.monthly_amount !== undefined && p.monthly_amount !== null && !isMinor(p.monthly_amount)) {
      return 'monthly_out_of_range';
    }
    return 'ok';
  }
  if (p.target === undefined || p.target === null) return 'target_required';
  if (p.ready_by === undefined || p.ready_by === null || p.ready_by === '') return 'ready_by_required';
  return 'ok';
}

export type PotLineSource = Pick<SavingsGoalRow, 'id' | 'kind' | 'target' | 'monthly_amount' | 'ready_by'>;

export function potLineFor(row: PotLineSource, amounts: PotAmounts, today: string): PotLine {
  return potSetAside(
    {
      id: row.id,
      kind: row.kind,
      target: row.target === null || amounts.target === null ? null : minorUnits(amounts.target),
      monthlyAmount: row.monthly_amount === null ? null : minorUnits(row.monthly_amount),
      readyBy: row.ready_by,
      saved: minorUnits(Math.max(0, amounts.saved ?? 0)),
    },
    today
  );
}

export function buildPotRow(row: SavingsGoalRow, amounts: PotAmounts, today: string): PotRowModel {
  const base = {
    row,
    kind: row.kind,
    saved: amounts.saved,
    target: amounts.target,
    pct: wholePercent(amounts.saved, amounts.target),
    month: row.ready_by === null ? null : row.ready_by.slice(0, 7),
    doneAt: row.done_at,
  };
  const noRate = amounts.saved === null || (row.target !== null && amounts.target === null);
  if (noRate) return { ...base, state: row.done_at === null ? 'no_rate' : 'done', monthly: 0, remaining: 0 };
  const line = potLineFor(row, amounts, today);
  const remaining = Math.max(0, (amounts.target ?? 0) - (amounts.saved ?? 0));
  if (row.done_at !== null) return { ...base, state: 'done', monthly: 0, remaining };
  return { ...base, state: line.state, monthly: line.monthly, remaining };
}

export function buildPotsModel(
  live: readonly SavingsGoalRow[],
  done: readonly SavingsGoalRow[],
  resolve: (row: SavingsGoalRow) => PotAmounts,
  today: string
): PotsScreenModel {
  const liveRows = live.map((r) => buildPotRow(r, resolve(r), today));
  const doneRows = done.map((r) => buildPotRow(r, resolve(r), today));
  const plainCount = liveRows.filter((r) => r.kind === 'pot').length;
  return {
    live: liveRows,
    done: doneRows,
    summary: { total: liveRows.reduce((sum, r) => sum + r.monthly, 0), count: liveRows.length },
    plainCount,
    addDisabled: plainCount >= MAX_POTS,
  };
}

/** Line 3 key and params by display state (the screen supplies the formatted values). */
export function lineThreeKey(r: PotRowModel): string {
  switch (r.state) {
    case 'reached':
      return 'decide.pots.stateReached';
    case 'past_due':
      return 'decide.pots.statePastDue';
    case 'no_rate':
      return 'decide.pots.stateNoRate';
    case 'done':
      return 'decide.pots.doneLine';
    default:
      return r.kind === 'wait'
        ? r.row.monthly_amount === null || r.row.monthly_amount === 0 || r.row.ready_by === null
          ? 'decide.pots.stateWaitBare'
          : 'decide.pots.stateWait'
        : 'decide.pots.stateActive';
  }
}
