// 06-14: the Debts read model on the LEDGER figures. Every number comes from the engine.
/* eslint-disable import/first */
import { renderHook } from '@testing-library/react-native';
import { LEDGER_TODAY, autoLoan, calcDebts } from '@/engine/grow/__tests__/fixtures/ledger';
import type { DebtRow } from '@/db/debts';

let mockRows: DebtRow[] | undefined;
let mockError = false;

jest.mock('@/data/queries/decide', () => ({
  useDebts: () => ({ data: mockRows, isError: mockError, refetch: jest.fn() }),
}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-11-05', ctx: {} }),
}));

import { buildDebtsModel, useDebtsRead } from '../useDebtsRead';
/* eslint-enable import/first */

const debt = (over: Partial<DebtRow> & { id: string; name: string }): DebtRow => ({
  household_id: 'h1',
  account_id: null,
  check_id: null,
  series_id: null,
  kind: 'loan',
  currency: 'USD',
  balance: 0,
  apr: null,
  minimum_payment: 0,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  due_day: null,
  started_balance: null,
  payoff_order: null,
  payoff_extra: 0,
  extra_series_id: null,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const AUTO = debt({
  id: 'auto',
  name: 'Auto loan',
  balance: autoLoan.balance,
  apr: autoLoan.apr,
  minimum_payment: autoLoan.payment,
  due_day: autoLoan.dueDay,
  started_balance: autoLoan.startedBalance,
});
const CARD = debt({ id: 'card', name: 'Visa', kind: 'card', ...calcDebts.card, minimum_payment: calcDebts.card.payment });

beforeEach(() => {
  mockRows = undefined;
  mockError = false;
});

describe('buildDebtsModel on the LEDGER', () => {
  it('one loan: payoff date, interest and the three scenarios', () => {
    const m = buildDebtsModel([AUTO], LEDGER_TODAY);
    expect(m.debts).toHaveLength(1);
    expect(m.debts[0]?.point.payoffDate).toBe('2029-04-15');
    expect(m.debts[0]?.point.totalInterest).toBe(75636);
    expect(m.oneDebt).toBe(true);
    expect(m.focus?.minimumOnly).toMatchObject({ months: 30, totalInterest: 75636 });
    expect(m.focus?.withExtra).toMatchObject({ months: 26, totalInterest: 64491 });
    expect(m.focus?.withLump).toMatchObject({ months: 26, totalInterest: 58204 });
  });

  it('one debt: both orders give the same plan', () => {
    const m = buildDebtsModel([AUTO], LEDGER_TODAY);
    expect(m.plan?.rate).toEqual(m.plan?.balance);
    expect(m.plan?.rate.withoutExtra).toMatchObject({ months: 30, totalInterest: 75636, payoffDate: '2029-04-15' });
  });

  it('a saved extra shows in the with-extra plan', () => {
    const m = buildDebtsModel([{ ...AUTO, payoff_extra: 5000, payoff_order: 'rate' }], LEDGER_TODAY);
    expect(m.extra).toBe(5000);
    expect(m.savedOrder).toBe('rate');
    expect(m.plan?.rate.withExtra).toMatchObject({ months: 26, totalInterest: 64491 });
    expect(m.plan?.rate.withoutExtra.months).toBe(30);
  });

  it('cards paid in full are listed apart and left out of the plan', () => {
    const paid = debt({ id: 'p', name: 'Amex', kind: 'card', balance: 50000, pays_in_full: 'yes' });
    const m = buildDebtsModel([AUTO, paid], LEDGER_TODAY);
    expect(m.paidInFull.map((l) => l.id)).toEqual(['p']);
    expect(m.debts.map((l) => l.id)).toEqual(['auto']);
    expect(m.oneDebt).toBe(true);
  });

  it('a carried card with no typed minimum uses the estimate and says so; Not sure counts as carried', () => {
    const card = debt({ id: 'c', name: 'Visa', kind: 'card', balance: 420000, apr: '21.9', minimum_payment: 0, pays_in_full: null });
    const m = buildDebtsModel([card], LEDGER_TODAY);
    const line = m.debts[0];
    expect(line?.minimumEstimated).toBe(true);
    expect(line?.point.minimum).toBeGreaterThan(0);
    expect(line?.inPlan).toBe(true);
    // A typed minimum is not an estimate.
    expect(buildDebtsModel([CARD], LEDGER_TODAY).debts[0]?.minimumEstimated).toBe(false);
  });

  it('two debts, two orders: both are worked out and the order can change the interest', () => {
    const m = buildDebtsModel([AUTO, CARD], LEDGER_TODAY);
    expect(m.oneDebt).toBe(false);
    expect(m.plan?.rate.withoutExtra.outcome).toBe('cleared');
    expect(m.plan?.balance.withoutExtra.outcome).toBe('cleared');
    expect(m.plan?.rate.withoutExtra.totalInterest).toBeLessThanOrEqual(m.plan?.balance.withoutExtra.totalInterest as number);
  });

  it('paid-off and deleted debts are left out; no debts gives no plan', () => {
    const m = buildDebtsModel([{ ...AUTO, paid_off_on: '2026-10-01' }, { ...CARD, deleted_at: '2026-10-02T00:00:00Z' }], LEDGER_TODAY);
    expect(m.debts).toEqual([]);
    expect(m.plan).toBeNull();
    expect(m.focus).toBeNull();
  });

  it('debts in another currency stay out of the plan (never mixed)', () => {
    const eur = debt({ id: 'e', name: 'EU loan', currency: 'EUR', balance: 100000, apr: '5', minimum_payment: 10000 });
    const m = buildDebtsModel([AUTO, eur], LEDGER_TODAY);
    expect(m.planCurrency).toBe('USD');
    expect(m.debts.find((l) => l.id === 'e')?.inPlan).toBe(false);
  });
});

describe('useDebtsRead', () => {
  it('reports loading, error and ready', async () => {
    const loading = await renderHook(() => useDebtsRead());
    expect(loading.result.current.status).toBe('loading');
    mockError = true;
    expect((await renderHook(() => useDebtsRead())).result.current.status).toBe('error');
    mockError = false;
    mockRows = [AUTO];
    const ready = await renderHook(() => useDebtsRead());
    expect(ready.result.current.status).toBe('ready');
    expect(ready.result.current.model.debts[0]?.point.totalInterest).toBe(75636);
    expect(ready.result.current.today).toBe('2026-11-05');
  });
});
