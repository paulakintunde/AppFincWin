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
jest.mock('@/features/decide/screens/past/data/usePastDecisions', () => ({
  usePastContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-11-05', ctx: {} }),
}));

import { buildDebtsModel, debtWhatIf, defaultWhatIfs, unitsToMinor, useDebtsRead, type DebtLine } from '../useDebtsRead';
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

  it('plan-wide what-ifs carry exact sooner and less-interest figures against minimum only', () => {
    const m = buildDebtsModel([AUTO], LEDGER_TODAY);
    const s = m.scenarios?.rate;
    expect(s?.minimumOnly).toMatchObject({ months: 30, totalInterest: 75636, payoffDate: '2029-04-15' });
    expect(s?.withExtra).toMatchObject({ months: 26, totalInterest: 64491, soonerMonths: 4, lessInterest: 11145 });
    expect(s?.withLump).toMatchObject({ outcome: 'cleared', months: 26, totalInterest: 58204, soonerMonths: 4, lessInterest: 17432 });
    expect(s?.lumpFirstDebtId).toBe('auto');
    expect(m.scenarios?.balance).toEqual(m.scenarios?.rate);
    expect(m.savedExtraPlan).toBeNull();
  });

  it('the saved-extra plan is set when the saved extra is above 0', () => {
    const m = buildDebtsModel([{ ...AUTO, payoff_extra: 5000 }], LEDGER_TODAY);
    expect(m.savedExtraPlan?.rate).toMatchObject({ months: 26, totalInterest: 64491 });
    expect(m.savedExtraPlan?.balance.payoffDate).not.toBeNull();
  });

  it('two debts: the one-off goes first to the higher rate, or to the smaller balance', () => {
    const m = buildDebtsModel([AUTO, CARD], LEDGER_TODAY);
    const byRate = [AUTO, CARD].reduce((a, b) => (Number(b.apr) > Number(a.apr) ? b : a));
    const bySize = [AUTO, CARD].reduce((a, b) => (b.balance < a.balance ? b : a));
    expect(m.scenarios?.rate.lumpFirstDebtId).toBe(byRate.id);
    expect(m.scenarios?.balance.lumpFirstDebtId).toBe(bySize.id);
    expect(m.scenarios?.rate.withExtra.soonerMonths).toBeGreaterThan(0);
  });

  it('a debt with no due day still gets a date (today\'s day is the fallback)', () => {
    const noDay = { ...AUTO, due_day: null };
    const m = buildDebtsModel([noDay], LEDGER_TODAY);
    expect(m.scenarios?.rate.minimumOnly.payoffDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.plan?.rate.withoutExtra.payoffDate).not.toBeNull();
    expect(m.plan?.rate.withoutExtra.payoffDate?.slice(8)).toBe(LEDGER_TODAY.slice(8));
  });

  it('a what-if that never clears has no date and no compare figures', () => {
    const weak = debt({ id: 'w', name: 'Weak', balance: 1000000, apr: '30', minimum_payment: 1000 });
    const m = buildDebtsModel([weak], LEDGER_TODAY, { extra: 0, lump: 0 });
    expect(m.scenarios?.rate.minimumOnly.payoffDate).toBeNull();
    expect(m.scenarios?.rate.withExtra).toMatchObject({ soonerMonths: null, lessInterest: null });
  });

  it('debtWhatIf works one debt via the engine', () => {
    const line = buildDebtsModel([AUTO], LEDGER_TODAY).debts[0] as DebtLine;
    const r = debtWhatIf(line, LEDGER_TODAY, { extra: 5000 });
    expect(r.minimumOnly).toMatchObject({ months: 30, totalInterest: 75636 });
    expect(r.scenario).toMatchObject({ months: 26, soonerMonths: 4, lessInterest: 11145 });
    const once = debtWhatIf(line, LEDGER_TODAY, { lump: 100000 });
    expect(once.scenario.totalInterest).toBe(58204);
    const none = debtWhatIf({ ...line, point: { ...line.point, dueDay: null } }, LEDGER_TODAY, {});
    expect(none.scenario).toMatchObject({ soonerMonths: 0, lessInterest: 0 });
    expect(none.scenario.payoffDate?.slice(8)).toBe(LEDGER_TODAY.slice(8));
    // a lump that clears it: month 0 means today
    expect(debtWhatIf(line, LEDGER_TODAY, { lump: line.point.balance }).scenario.payoffDate).toBe(LEDGER_TODAY);
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

describe('P3 review fixes', () => {
  it('P3-WR-10: cached rows stay ready when a refetch fails', async () => {
    mockError = true;
    mockRows = [AUTO];
    expect((await renderHook(() => useDebtsRead())).result.current.status).toBe('ready');
  });

  it('P3-WR-04: the starting what-ifs use the currency’s own decimals', () => {
    expect(defaultWhatIfs('USD')).toEqual({ extra: 5000, lump: 100000 });
    expect(defaultWhatIfs('JPY')).toEqual({ extra: 50, lump: 1000 });
    expect(defaultWhatIfs('KWD')).toEqual({ extra: 50000, lump: 1000000 });
    expect(unitsToMinor(25, 'JPY')).toBe(25);
  });

  it('P3-WR-11: each debt carries one end date and interest, from the saved plan when there is one', () => {
    const own = buildDebtsModel([AUTO], '2026-11-05').debts[0]!;
    expect(own.endsInPlan).toBe(false);
    expect(own.interestLeft).toBe(own.point.totalInterest);
    const planned = buildDebtsModel([{ ...AUTO, payoff_extra: 5000 }, CARD], '2026-11-05').debts;
    for (const d of planned) {
      expect(d.endsInPlan).toBe(true);
      expect(d.endDate).not.toBeNull();
      expect(d.interestLeft).not.toBeNull();
    }
  });
});
