// 06-05 (BO-07 items 2, 3, 4): the shapes Grow hands to Decide. PURE types: no React, no I/O.
// Source rows are the structural subset of the stored rows the connection points read; cached old rows may lack the newer
// fields, so every Grow-added field is optional and the safe default applies when it is absent.
import type { MinorUnits } from '@/engine/money';
import type { Percent } from '@/engine/payoff';

export interface GoalSourceRow {
  id: string;
  name: string;
  currency: string;
  target: number | null;
  monthly_amount: number | null;
  ready_by: string | null;
  opening_saved: number;
  kind: 'wait' | 'pot';
  bucket?: string | null;
  account_id?: string | null;
  check_id: string | null;
  done_at: string | null;
  deleted_at: string | null;
  is_safety_net?: boolean;
  locked?: boolean;
  protect?: boolean;
  up_front_only?: boolean;
  net_confirmed_at?: string | null;
}

export interface GoalLineSource {
  id: string;
  goal_id?: string | null;
  status: string;
  deleted_at: string | null;
  transfer_id: string | null;
  original_amount: number;
  original_currency: string;
  local_date: string;
}

/** Converts an amount to the home currency; null when no stored rate converts it. */
export type ToHome = (amount: number, currency: string) => number | null;

export interface GoalPoint {
  id: string;
  name: string;
  kind: 'wait' | 'pot';
  target: MinorUnits | null;
  saved: MinorUnits;
  monthlyAmount: MinorUnits | null;
  readyBy: string | null;
  locked: boolean;
  upFrontOnly: boolean;
  linkedCheckId: string | null;
  accountId: string | null;
  bucket: boolean;
  done: boolean;
}

export interface SafetyNetPoint {
  goalId: string;
  size: MinorUnits | null;
  saved: MinorUnits;
  protect: boolean;
  locked: true;
  accountId: string | null;
  confirmedAt: string | null;
}

export interface DebtSourceRow {
  id: string;
  kind: 'loan' | 'card' | 'other';
  account_id: string | null;
  check_id: string | null;
  balance: number;
  apr: string | null;
  minimum_payment: number;
  secured: boolean;
  is_housing: boolean;
  due_day?: number | null;
  pays_in_full?: 'yes' | 'sometimes' | 'no' | null;
  paid_off_on?: string | null;
  deleted_at: string | null;
  started_balance?: number | null;
  payoff_order?: 'rate' | 'balance' | null;
  payoff_extra?: number;
}

export interface DebtPoint {
  id: string;
  balance: MinorUnits;
  apr: Percent | null;
  minimum: MinorUnits;
  dueDay: number | null;
  payoffDate: string | null;
  totalInterest: MinorUnits | null;
  paidInFull: boolean;
  linkedCheckId: string | null;
  paidOff: boolean;
}
