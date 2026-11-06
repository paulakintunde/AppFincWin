import { renderHook } from '@testing-library/react-native';

import { useDecideAccess } from '../useDecideAccess';

const mockUseProfile = jest.fn();
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => mockUseProfile() }));

// Owner 2026-11-06 (quick-261106-bf2): DECIDE_V3 is on, so every account gets v3 whatever profiles.decide_v3 says.
describe('useDecideAccess', () => {
  it('v3 while loading', async () => {
    mockUseProfile.mockReturnValue({ profile: null });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: true });
  });
  it('v3 when the field is missing', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u' } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: true });
  });
  it('false flag -> still v3', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', decide_v3: false } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: true });
  });
  it('true flag -> true', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', decide_v3: true } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: true });
  });
});
