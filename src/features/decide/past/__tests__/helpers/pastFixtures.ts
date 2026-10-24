import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { emptyCheckInputs } from '../../../snapshot/checkInputs';
import type { CheckInputs } from '../../../snapshot/types';

export const TODAY = '2026-10-15';

export function inputs(over: Partial<CheckInputs> = {}): Record<string, unknown> {
  return {
    ...emptyCheckInputs('buy', TODAY),
    name: 'Laptop',
    advertised: 50_000,
    method: 'cash',
    currency: 'USD',
    ...over,
  } as unknown as Record<string, unknown>;
}

export function decision(id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Laptop',
    inputs: inputs(),
    status: 'bought',
    furthest_step: 5,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: '2026-08-01T12:00:00Z',
    verdict_at_decision: 'fits',
    estimate_day_one: 50_000,
    estimate_monthly: 10_000,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: 10_000,
    estimate_running: 0,
    is_sample: false,
    deleted_at: null,
    version: 3,
    updated_by: null,
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...over,
  };
}

export function link(id: string, checkId: string, over: Partial<DecideLinkRow> = {}): DecideLinkRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    check_id: checkId,
    entity: 'transactions',
    target_id: 'tx1',
    source: 'written',
    role: 'day_one',
    deleted_at: null,
    version: 1,
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...over,
  };
}

export function line(id: string, over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id,
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -50_000,
    original_currency: 'USD',
    home_currency: 'USD',
    home_amount: -50_000,
    orig_per_eur: null,
    local_date: '2026-08-01',
    name: 'Laptop',
    note: null,
    status: 'paid',
    deleted_at: null,
    recurring_series_id: null,
    ...over,
  } as unknown as TransactionRow;
}

export function goal(checkId: string, over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return {
    id: 'g1',
    household_id: 'h1',
    created_by: 'u1',
    check_id: checkId,
    name: 'Laptop',
    currency: 'USD',
    target: 90_000,
    monthly_amount: 20_000,
    ready_by: '2027-01-15',
    opening_saved: 0,
    kind: 'wait',
    done_at: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-08-01T12:00:00Z',
    updated_at: '2026-08-01T12:00:00Z',
    ...over,
  };
}
