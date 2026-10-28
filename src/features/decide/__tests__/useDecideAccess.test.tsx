import { renderHook } from '@testing-library/react-native';

import { useDecideAccess } from '../useDecideAccess';

const mockUseProfile = jest.fn();
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => mockUseProfile() }));

describe('useDecideAccess', () => {
  it('fails closed while loading', async () => {
    mockUseProfile.mockReturnValue({ profile: null });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: false });
  });
  it('fails closed when the field is missing', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u' } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: false });
  });
  it('false flag -> false', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', decide_v3: false } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: false });
  });
  it('true flag -> true', async () => {
    mockUseProfile.mockReturnValue({ profile: { id: 'u', decide_v3: true } });
    expect((await renderHook(() => useDecideAccess())).result.current).toEqual({ v3: true });
  });
});
