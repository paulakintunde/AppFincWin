// D-14: proves useProfile selects the own profile row and applies its saved theme via
// theme.applyRemote() on load, that setAccent updates the theme immediately and persists
// only the changed column, that it tracks theme_accent_changed, and that a failed update
// keeps the local choice while surfacing saveError.
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile } from '../useProfile';

// useProfile reads the shared profile row from the TanStack Query cache, so every render
// needs a provider -- a fresh client per test keeps cached rows from leaking between tests.
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const mockSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn((..._args: unknown[]) => ({ select: mockSelect, update: mockUpdate }));

jest.mock('@/services/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

let mockUser: { id: string } | null = { id: '11111111-1111-4111-8111-111111111111' };
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockApplyRemote = jest.fn();
const mockSetAccent = jest.fn();
const mockSetPairing = jest.fn();
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    applyRemote: mockApplyRemote,
    setAccent: mockSetAccent,
    setPairing: mockSetPairing,
  }),
}));

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({
  getAnalytics: () => ({ track: mockTrack }),
}));

const PROFILE_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  accent: 'green',
  font_pairing: 'bold',
  analytics_consent: null,
  analytics_consent_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockUser = { id: '11111111-1111-4111-8111-111111111111' };
  mockSingle.mockResolvedValue({ data: PROFILE_ROW, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
});

describe('useProfile', () => {
  it('selects the own profile row and applies the saved theme once loaded', async () => {
    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockSelectEq).toHaveBeenCalledWith('id', PROFILE_ROW.id);
    expect(mockApplyRemote).toHaveBeenCalledWith('green', 'bold');
    expect(result.current.profile).toEqual(PROFILE_ROW);
  });

  it('setAccent updates the theme immediately, persists the changed column, and tracks the event', async () => {
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setAccent('rust');
    });

    expect(mockSetAccent).toHaveBeenCalledWith('rust');
    expect(mockUpdate).toHaveBeenCalledWith({ accent: 'rust' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', PROFILE_ROW.id);
    expect(mockTrack).toHaveBeenCalledWith('theme_accent_changed', { accent: 'rust' });
    expect(result.current.profile?.accent).toBe('rust');
    expect(result.current.saveError).toBe(false);
  });

  it('a failed setAccent keeps the local theme choice and surfaces saveError', async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: 'network error' } });
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setAccent('navy');
    });

    // The live theme change still happened (kept, not reverted) — only the persisted
    // profile copy and the tracked event are skipped.
    expect(mockSetAccent).toHaveBeenCalledWith('navy');
    expect(mockTrack).not.toHaveBeenCalledWith('theme_accent_changed', expect.anything());
    expect(result.current.profile?.accent).toBe('green');
    expect(result.current.saveError).toBe(true);
  });

  it('setPairing updates the theme immediately, persists the changed column, and tracks the event', async () => {
    const { result } = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setPairing('grotesk');
    });

    expect(mockSetPairing).toHaveBeenCalledWith('grotesk');
    expect(mockUpdate).toHaveBeenCalledWith({ font_pairing: 'grotesk' });
    expect(mockTrack).toHaveBeenCalledWith('theme_font_changed', { pairing: 'grotesk' });
    expect(result.current.profile?.font_pairing).toBe('grotesk');
  });

  it('does not query or apply a theme when signed out', async () => {
    mockUser = null;
    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockApplyRemote).not.toHaveBeenCalled();
    expect(result.current.profile).toBeNull();
  });

  it('two callers share one row: a write through one is seen by the other, fetched once', async () => {
    const { result } = await renderHook(() => ({ a: useProfile(), b: useProfile() }), { wrapper });
    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(mockApplyRemote).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.a.setAccent('rust');
    });

    expect(result.current.b.profile?.accent).toBe('rust');
  });

  it('a failed fetch settles loading to false with no profile', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });
    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull();
  });
});
