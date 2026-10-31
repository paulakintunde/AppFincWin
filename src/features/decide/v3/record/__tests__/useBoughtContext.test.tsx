import { renderHook } from '@testing-library/react-native';
import { pickCashAccount, useBoughtContext } from '../useBoughtContext';

jest.setTimeout(60000);

let mockAccounts: unknown[] | undefined;
let mockHousehold: string | null = 'h1';
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ builtinIds: new Map([['Debt', 'cat-debt']]) }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: mockHousehold, userId: 'u1', timeZone: 'Europe/London', today: '2026-10-30', homeCurrency: 'USD' }),
}));

type Acct = { id: string; kind: 'savings' | 'cash' | 'checking'; currency: string; archived_at: string | null; deleted_at: string | null; use: 'everyday' | null };
const acct = (o: Partial<Acct>): Acct => ({
  id: 'a',
  kind: 'savings',
  currency: 'GBP',
  archived_at: null,
  deleted_at: null,
  use: null,
  ...o,
});
const row = { id: 'c1', name: '  Sofa ' } as never;
const purchase = { categoryId: 'cat-home' } as never;

describe('pickCashAccount', () => {
  it('takes the first live everyday account', () => {
    const list = [acct({ id: 'x', kind: 'checking' }), acct({ id: 'y', use: 'everyday' }), acct({ id: 'z', use: 'everyday' })];
    expect(pickCashAccount(list)?.id).toBe('y');
  });
  it('skips archived and deleted accounts', () => {
    const list = [acct({ id: 'x', use: 'everyday', archived_at: 'now' }), acct({ id: 'y', use: 'everyday', deleted_at: 'now' })];
    expect(pickCashAccount(list)).toBeNull();
  });
  it('falls back to a cash or checking account, else none', () => {
    expect(pickCashAccount([acct({ id: 's' }), acct({ id: 'c', kind: 'cash' })])?.id).toBe('c');
    expect(pickCashAccount([acct({ id: 's' })])).toBeNull();
    expect(pickCashAccount(undefined)).toBeNull();
  });
});

describe('useBoughtContext', () => {
  beforeEach(() => {
    mockHousehold = 'h1';
    mockAccounts = [acct({ id: 'a1', use: 'everyday', currency: 'EUR' })];
  });

  it('builds the write context', async () => {
    const { result } = await renderHook(() => useBoughtContext(row, purchase, '7.5'));
    expect(result.current).toEqual({
      householdId: 'h1',
      currency: 'USD',
      timeZone: 'Europe/London',
      today: '2026-10-30',
      cashAccountId: 'a1',
      debtCategoryId: 'cat-debt',
      runningCostCategoryId: 'cat-home',
      name: 'Sofa',
      aprText: '7.5',
    });
  });

  it('uses the home currency, not the everyday account currency', async () => {
    mockAccounts = [acct({ id: 'a-gbp', use: 'everyday', currency: 'GBP' })];
    const ctx = (await renderHook(() => useBoughtContext(row, purchase))).result.current;
    expect(ctx?.currency).toBe('USD');
    expect(ctx?.cashAccountId).toBe('a-gbp');
  });

  it('is null with no everyday account, no household or no check', async () => {
    mockAccounts = [];
    expect((await renderHook(() => useBoughtContext(row, purchase))).result.current).toBeNull();
    mockAccounts = [acct({ id: 'a1', use: 'everyday' })];
    mockHousehold = null;
    expect((await renderHook(() => useBoughtContext(row, purchase))).result.current).toBeNull();
    mockHousehold = 'h1';
    expect((await renderHook(() => useBoughtContext(null, null))).result.current).toBeNull();
  });

  it('has a null running-cost category when there is no purchase', async () => {
    expect((await renderHook(() => useBoughtContext(row, null))).result.current?.runningCostCategoryId).toBeNull();
  });
});
