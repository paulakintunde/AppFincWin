// 07-07 (D-18): the Insights switch shows with 2+ members, persists per device and sets the figure currency.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { useInsightsScope } from '../useInsightsScope';

const mock = { members: [{ user_id: 'a' }] as unknown[], currency: 'EUR' };
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'hh1', userId: 'u1', homeCurrency: 'USD', today: '2026-11-10' }),
}));
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mock.members }),
  useHousehold: () => ({ data: { reporting_currency: mock.currency } }),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  mock.members = [{ user_id: 'a' }];
});

describe('useInsightsScope', () => {
  it('stays Just me with one member even if Household was stored', async () => {
    await AsyncStorage.setItem('fincwin:figureScope.insights', 'household');
    const { result } = await renderHook(() => useInsightsScope());
    await act(async () => undefined);
    expect(result.current.showScope).toBe(false);
    expect(result.current.scope).toBe('mine');
    expect(result.current.currency).toBe('USD');
  });

  it('reads the stored Household choice with two members, in the household currency', async () => {
    mock.members = [{ user_id: 'a' }, { user_id: 'b' }];
    await AsyncStorage.setItem('fincwin:figureScope.insights', 'household');
    const { result } = await renderHook(() => useInsightsScope());
    await act(async () => undefined);
    expect(result.current.showScope).toBe(true);
    expect(result.current.scope).toBe('household');
    expect(result.current.currency).toBe('EUR');
    await act(async () => result.current.setScope('mine'));
    expect(result.current.currency).toBe('USD');
    expect(await AsyncStorage.getItem('fincwin:figureScope.insights')).toBe('mine');
  });
});
