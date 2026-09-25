// ACC-05: proves AuthProvider's status transitions (loading -> signedOut/signedIn from
// getSession, live updates from onAuthStateChange), the unsubscribe-on-unmount cleanup, the
// ACC-03 retryPendingFirstAuthProfile-once-on-mount-with-a-session call, and that useAuth()
// throws outside the provider.
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockConfigureGoogle = jest.fn();
const mockRetryPendingFirstAuthProfile = jest.fn(async () => undefined);
const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();

let mockAuthStateCallback: ((event: string, session: unknown) => void) | undefined;

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockAuthStateCallback = callback;
        return mockOnAuthStateChange(callback);
      },
    },
  },
}));

jest.mock('@/services/auth', () => ({
  configureGoogle: (...args: unknown[]) => mockConfigureGoogle(...args),
  retryPendingFirstAuthProfile: (...args: unknown[]) => mockRetryPendingFirstAuthProfile(...args),
  signInWithApple: (...args: unknown[]) => mockSignInWithApple(...args),
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
}));

import { AuthProvider, useAuth } from '../AuthProvider';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStateCallback = undefined;
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
});

describe('AuthProvider', () => {
  it('starts loading, then becomes signedOut once getSession resolves null', async () => {
    let resolveSession!: (value: { data: { session: null } }) => void;
    const sessionPromise = new Promise<{ data: { session: null } }>((resolve) => {
      resolveSession = resolve;
    });
    mockGetSession.mockReturnValue(sessionPromise);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      resolveSession({ data: { session: null } });
      await sessionPromise;
    });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('becomes signedIn with the user id once getSession resolves a session', async () => {
    const session = { user: { id: 'user-1' } };
    mockGetSession.mockResolvedValue({ data: { session } });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user?.id).toBe('user-1');
    expect(result.current.session).toBe(session);
  });

  it('calls retryPendingFirstAuthProfile once when a session exists on mount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

    await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(mockRetryPendingFirstAuthProfile).toHaveBeenCalledTimes(1));
  });

  it('does not call retryPendingFirstAuthProfile when no session exists on mount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(mockRetryPendingFirstAuthProfile).not.toHaveBeenCalled();
  });

  it('flips to signedIn on a SIGNED_IN event and back to signedOut on SIGNED_OUT', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    const session = { user: { id: 'user-2' } };
    act(() => {
      mockAuthStateCallback?.('SIGNED_IN', session);
    });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user?.id).toBe('user-2');

    act(() => {
      mockAuthStateCallback?.('SIGNED_OUT', null);
    });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.user).toBeNull();
  });

  it('calls configureGoogle once on mount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await renderHook(() => useAuth(), { wrapper });

    expect(mockConfigureGoogle).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from onAuthStateChange on unmount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result, unmount } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('useAuth throws outside an AuthProvider', async () => {
    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth must be used within an AuthProvider'
    );
  });
});
