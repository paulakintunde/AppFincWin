import { queryKeys } from '@/data/keys';
import { monthRefreshKeys } from '../refreshKeys';

describe('monthRefreshKeys', () => {
  it('is empty without a household', () => {
    expect(monthRefreshKeys(null, '2026-10')).toEqual([]);
    expect(monthRefreshKeys(undefined, '2026-10')).toEqual([]);
  });

  it('lists every key, including account balances, in order', () => {
    expect(monthRefreshKeys('h1', '2026-10')).toEqual([
      queryKeys.transactionsMonth('h1', '2026-10'),
      queryKeys.recurringSeries('h1'),
      queryKeys.fxLatest(),
      queryKeys.transactionMonths('h1'),
      queryKeys.accounts('h1'),
      queryKeys.accountBalances('h1'),
    ]);
  });
});
