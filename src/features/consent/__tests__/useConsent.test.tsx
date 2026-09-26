// Regression (Phase 0 acceptance, Pixel 9): tapping "Share usage" on the consent screen hit
// "Maximum update depth exceeded" in NativeStackNavigator. The (app) layout and ConsentScreen
// each called useConsent() -> useProfile(), and useProfile held its row in per-instance
// state, so grant() refreshed only the screen's copy: the screen redirected to /you while the
// layout's copy still read consent null and redirected back to /consent, forever. These tests
// pin the shared-source behaviour: every consumer sees the same consent in the same render,
// a persisted stale "no consent" never triggers the prompt before a fresh fetch settles, and
// a failed or empty profile fetch settles instead of hanging.
import { useEffect } from 'react';
import { Text } from 'react-native';
import { render, renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useConsent, type UseConsentResult } from '../useConsent';

const USER_ID = '11111111-1111-4111-8111-111111111111';

let mockServerConsent: 'granted' | 'declined' | null = null;
let mockSelectResult: () => Promise<{ data: unknown; error: unknown }>;
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn((patch: { analytics_consent?: 'granted' | 'declined' }) => ({
  eq: (...args: unknown[]) => {
    const res = mockUpdateEq(...args) as Promise<{ error: unknown }>;
    return res.then((r) => {
      if (!r.error && patch.analytics_consent) mockServerConsent = patch.analytics_consent;
      return r;
    });
  },
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mockSelectResult() }) }),
      update: (patch: { analytics_consent?: 'granted' | 'declined' }) => mockUpdate(patch),
    }),
  },
}));

let mockUser: { id: string } | null = { id: USER_ID };
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ applyRemote: jest.fn(), setAccent: jest.fn(), setPairing: jest.fn() }),
}));

const mockEnable = jest.fn();
const mockDisable = jest.fn();
jest.mock('@/services/analytics', () => ({
  getAnalytics: () => ({ track: jest.fn(), enable: mockEnable, disable: mockDisable }),
}));

function row(consent: 'granted' | 'declined' | null) {
  return {
    id: USER_ID,
    full_name: 'Ada Lovelace',
    email: 'ada@example.com',
    accent: 'green',
    font_pairing: 'bold',
    analytics_consent: consent,
    analytics_consent_at: consent ? '2026-09-26T00:00:00.000Z' : null,
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER_ID };
  mockServerConsent = null;
  mockSelectResult = () => Promise.resolve({ data: row(mockServerConsent), error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
});

describe('useConsent shared across consumers', () => {
  it('after grant() in one consumer, an independent consumer also sees granted / needsPrompt false', async () => {
    const client = newClient();
    let screen: UseConsentResult | undefined;

    // Layout-like consumer: only reads needsPrompt, never calls grant().
    function LayoutProbe() {
      const { loading, needsPrompt, consent } = useConsent();
      return <Text testID="layout">{`${loading}|${needsPrompt}|${consent}`}</Text>;
    }
    // Screen-like consumer: holds grant().
    function ScreenProbe() {
      const c = useConsent();
      useEffect(() => {
        screen = c;
      });
      return <Text testID="screen">{`${c.loading}|${c.needsPrompt}|${c.consent}`}</Text>;
    }

    const { getByTestId } = await render(
      <QueryClientProvider client={client}>
        <LayoutProbe />
        <ScreenProbe />
      </QueryClientProvider>
    );

    await waitFor(() => expect(getByTestId('layout').props.children).toBe('false|true|null'));
    expect(getByTestId('screen').props.children).toBe('false|true|null');

    await act(async () => {
      await screen!.grant();
    });

    // Both consumers flip — the layout's copy is not left behind reading "no consent".
    // waitFor, not a bare expect: the write's background refetch can land inside or after
    // act() depending on runner speed (flaked once on CI); both consumers must still settle
    // on granted.
    await waitFor(() => {
      expect(getByTestId('screen').props.children).toBe('false|false|granted');
      expect(getByTestId('layout').props.children).toBe('false|false|granted');
    });
    expect(mockEnable).toHaveBeenCalledWith(USER_ID);
  });

  it('a failed consent write leaves consent unanswered and reports failure', async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: 'network error' } });
    const client = newClient();
    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.grant();
    });

    expect(ok).toBe(false);
    expect(result.current.consent).toBeNull();
    expect(result.current.needsPrompt).toBe(true);
    expect(mockEnable).not.toHaveBeenCalled();
  });
});

describe('useConsent cold start', () => {
  it('signed in with consent granted on the server: loading settles to false and no prompt', async () => {
    mockServerConsent = 'granted';
    const client = newClient();
    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consent).toBe('granted');
    expect(result.current.needsPrompt).toBe(false);
  });

  it('a persisted stale "no consent" does not prompt while the fresh fetch is in flight', async () => {
    mockServerConsent = 'granted';
    let release: () => void = () => undefined;
    mockSelectResult = () =>
      new Promise((resolve) => {
        release = () => resolve({ data: row(mockServerConsent), error: null });
      });
    const client = newClient();
    // As restored from the persisted cache: written in an earlier app session.
    client.setQueryData(queryKeys.profile(USER_ID), row(null), { updatedAt: 1 });

    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    // The stale null must not read as "needs the prompt" before the server answers.
    expect(result.current.needsPrompt).toBe(false);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consent).toBe('granted');
    expect(result.current.needsPrompt).toBe(false);
  });

  it('a failed profile fetch settles (loading false) without prompting', async () => {
    mockSelectResult = () => Promise.resolve({ data: null, error: { message: 'boom', code: '500' } });
    const client = newClient();
    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consent).toBeNull();
    expect(result.current.needsPrompt).toBe(false);
  });

  it('a missing profile row settles (loading false) without prompting', async () => {
    mockSelectResult = () =>
      Promise.resolve({ data: null, error: { message: 'no rows', code: 'PGRST116' } });
    const client = newClient();
    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsPrompt).toBe(false);
  });

  it('signed out: not loading, no prompt, no fetch', async () => {
    mockUser = null;
    const select = jest.fn();
    mockSelectResult = select;
    const client = newClient();
    const { result } = await renderHook(() => useConsent(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.needsPrompt).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
});
