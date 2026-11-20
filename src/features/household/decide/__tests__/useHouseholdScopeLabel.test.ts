import { renderHook } from '@testing-library/react-native';
import { useHouseholdScopeLabel } from '../useHouseholdScopeLabel';

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
let mockHousehold: { name: string | null } | null = { name: 'Flat 4B' };
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: 'h1' }),
  useHousehold: () => ({ data: mockHousehold }),
}));

describe('useHouseholdScopeLabel', () => {
  beforeEach(() => {
    mockHousehold = { name: 'Flat 4B' };
  });

  it('reads "Just you" for a Just me check', async () => {
    const { result } = await renderHook(() => useHouseholdScopeLabel('me'));
    expect(result.current).toBe('Just you');
  });

  it('reads "Household · {name}" for a Household check', async () => {
    const { result } = await renderHook(() => useHouseholdScopeLabel('household'));
    expect(result.current).toBe('Household · Flat 4B');
  });

  it('trims the name and falls back to the plain word for a household with none', async () => {
    mockHousehold = { name: '  Flat 4B ' };
    expect((await renderHook(() => useHouseholdScopeLabel('household'))).result.current).toBe('Household · Flat 4B');
    mockHousehold = { name: '   ' };
    const plain = (await renderHook(() => useHouseholdScopeLabel('household'))).result.current;
    expect(plain.startsWith('Household · ')).toBe(true);
    expect(plain).not.toContain('Flat');
    mockHousehold = null;
    expect((await renderHook(() => useHouseholdScopeLabel('household'))).result.current.startsWith('Household · ')).toBe(true);
  });
});
