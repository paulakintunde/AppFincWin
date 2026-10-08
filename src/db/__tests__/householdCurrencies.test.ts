// 02-49: the distinct currencies a household already uses.
import type { DbClient } from '../rows';
import { fetchHouseholdCurrencies } from '../householdCurrencies';

const mockAccounts = jest.fn();
const mockBalances = jest.fn();
const mockSeries = jest.fn();
jest.mock('../accounts', () => ({ fetchAccounts: (...a: unknown[]) => mockAccounts(...a) }));
jest.mock('../recordReads', () => ({ fetchAccountBalances: (...a: unknown[]) => mockBalances(...a) }));
jest.mock('../recurringSeries', () => ({ fetchRecurringSeries: (...a: unknown[]) => mockSeries(...a) }));

const client = {} as DbClient;

beforeEach(() => {
  mockAccounts.mockReset().mockResolvedValue([]);
  mockBalances.mockReset().mockResolvedValue([]);
  mockSeries.mockReset().mockResolvedValue([]);
});

describe('fetchHouseholdCurrencies', () => {
  it('unions accounts, line currencies and series, deduped and sorted', async () => {
    mockAccounts.mockResolvedValue([{ currency: 'USD' }, { currency: 'GBP' }, { currency: 'GBP' }]);
    mockBalances.mockResolvedValue([{ currency: 'GBP' }, { currency: 'JPY' }]);
    mockSeries.mockResolvedValue([{ currency: 'EUR' }]);
    expect(await fetchHouseholdCurrencies(client, 'h1')).toEqual(['EUR', 'GBP', 'JPY', 'USD']);
    expect(mockAccounts).toHaveBeenCalledWith(client, 'h1');
  });

  it.each([['accounts'], ['balances'], ['series']])('throws when the %s read fails', async (which) => {
    const mocks: Record<string, jest.Mock> = { accounts: mockAccounts, balances: mockBalances, series: mockSeries };
    mocks[which]!.mockRejectedValue(new Error('db'));
    await expect(fetchHouseholdCurrencies(client, 'h1')).rejects.toThrow('db');
  });
});
