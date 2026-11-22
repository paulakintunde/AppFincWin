import { renderHook } from '@testing-library/react-native';
import { useFeature } from '../useFeature';

let mockMembers = 2;
let mockLevel: number | null = 1;
let mockHolds = false;
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ writable: true, members: mockMembers }) }));
jest.mock('@/features/levels/useUserSetup', () => ({
  useUserSetup: () => ({ data: mockLevel === null ? null : { level: mockLevel }, loading: false }),
}));
jest.mock('@/data/queries/userSetup', () => ({ useFeatureSwitches: () => ({ data: {} }) }));
jest.mock('@/features/levels/useHoldsData', () => ({
  useHoldsData: () => ({ weightSplits: mockHolds, amountSplits: mockHolds, categoryDefaultSplits: mockHolds }),
}));

describe('useFeature (09-13: through useFeatureAccess)', () => {
  beforeEach(() => {
    mockMembers = 2;
    mockLevel = 1;
    mockHolds = false;
  });

  it('is off when the person shares money with no one', async () => {
    mockMembers = 1;
    const { result } = await renderHook(() => useFeature('hh.weightSplit'));
    expect(result.current).toBe(false);
  });

  it('is on with two members at level 1: household features ignore the level (TIER-06)', async () => {
    const { result } = await renderHook(() => useFeature('hh.weightSplit'));
    expect(result.current).toBe(true);
    const cat = await renderHook(() => useFeature('hh.categoryDefaults'));
    expect(cat.result.current).toBe(true);
  });

  it('is off for a household of one even when records exist', async () => {
    mockMembers = 1;
    mockHolds = true;
    const { result } = await renderHook(() => useFeature('hh.amountSplit'));
    expect(result.current).toBe(false);
  });

  it('reads a missing level as 4 and stays on', async () => {
    mockLevel = null;
    const { result } = await renderHook(() => useFeature('hh.amountSplit'));
    expect(result.current).toBe(true);
  });
});
